// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "CALL_LLM_MARKING") {
    handleLLMMarkingRequest(request, sender, sendResponse);
    return true; // Keep response channel open
  } else if (request.type === "FETCH_IMAGE_BASE64") {
    handleFetchImageBase64(request, sender, sendResponse);
    return true;
  } else if (request.type === "EXECUTE_IN_MAIN_WORLD") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      world: "MAIN",
      func: () => {
        try {
          const results = [];
          results.push("--- NCU CORE SOURCE INSPECT ---");
          if (window.PersonalMarkingSingleton) {
            const pm = window.PersonalMarkingSingleton;
            const targetMethods = [
              'bindAnnotationEvent',
              'changeAnnotationCss',
              'clearMarkingHtml'
            ];
            targetMethods.forEach(m => {
              if (typeof pm[m] === 'function') {
                results.push("[Core Method Source] PersonalMarkingSingleton." + m + ":\n" + pm[m].toString());
              } else {
                results.push("[Core Method Source] PersonalMarkingSingleton." + m + " is NOT a function");
              }
            });
          } else {
            results.push("PersonalMarkingSingleton NOT found on window.");
          }
          console.log(results.join("\n"));
          return results;
        } catch (e) {
          console.error("Core Source Inspect failed:", e);
          return { error: e.message };
        }
      }
    }).then((injectionResults) => {
        if (injectionResults && injectionResults.length > 0) {
            sendResponse({ success: true, result: injectionResults[0].result });
        } else {
            sendResponse({ success: false, error: "Injection returned no result" });
        }
    }).catch(err => {
        console.error("[BG] Execute script in main world failed:", err);
        sendResponse({ success: false, error: err.toString() });
    });
    return true;
  } else if (request.type === "NCU_SET_TOOL") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      world: "MAIN",
      func: (toolType) => {
        try {
          const pm = window.PersonalMarkingSingleton;
          const cu = window.CommonUtil;
          if (pm && cu) {
            const jq = window.jQuery || window.$;
            if (jq) {
              jq("a[name='AnnotationType']").each(function () {
                var type = jq(this).attr("type");
                if (type !== "star") {
                  if (type === toolType && type !== "empty") {
                    jq(this).removeAttr("class").addClass(type + "on");
                    sessionStorage.setItem('annotationType', type);
                  } else {
                    jq(this).removeAttr("class").addClass(type);
                  }
                }
              });
              jq("a[name='actionTypeBtn'], [name=actionTypeBtnHalf]").removeAttr("class");
            }
            
            cu.AnnotationType = toolType;
            if (pm.TopicDetailObj && typeof pm.TopicDetailObj.bindImgEvent === 'function') {
              pm.TopicDetailObj.bindImgEvent();
            }
            console.log(`[NCU Main World] Successfully force-set tool state to: ${toolType} (active)`);
            return { success: true };
          }
          return { success: false, error: "PersonalMarkingSingleton or CommonUtil not found" };
        } catch (e) {
          console.error("[NCU Main World] Set tool failed:", e);
          return { success: false, error: e.message };
        }
      },
      args: [request.payload.toolType]
    }).then((injectionResults) => {
        if (injectionResults && injectionResults.length > 0) {
            sendResponse(injectionResults[0].result);
        } else {
            sendResponse({ success: false, error: "Injection returned no result" });
        }
    }).catch(err => {
        console.error("[BG] Execute set tool in main world failed:", err);
        sendResponse({ success: false, error: err.toString() });
    });
    return true;
  } else if (request.type === "NCU_CLEAR_MARKINGS") {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
      world: "MAIN",
      func: () => {
        try {
          const pm = window.PersonalMarkingSingleton;
          const cu = window.CommonUtil;
          
          const annotations = document.querySelectorAll('a[name="annotation"], div[name="annotation"], .sketcher, .canvas-sketcher');
          annotations.forEach(el => el.remove());
          
          if (pm && typeof pm.changeAnnotationCss === 'function') {
             pm.changeAnnotationCss("empty");
          }
          if (cu) {
             cu.AnnotationType = "";
          }
          if (pm && pm.TopicDetailObj && typeof pm.TopicDetailObj.unbindImgEvent === 'function') {
             pm.TopicDetailObj.unbindImgEvent();
          }
          
          console.log(`[NCU Main World] Cleared all annotations.`);
          return { success: true };
        } catch (e) {
          return { success: false, error: e.message };
        }
      }
    }).then((injectionResults) => {
        if (injectionResults && injectionResults.length > 0) {
            sendResponse(injectionResults[0].result);
        } else {
            sendResponse({ success: false, error: "Injection returned no result" });
        }
    }).catch(err => {
        console.error("[BG] Execute clear markings failed:", err);
        sendResponse({ success: false, error: err.toString() });
    });
    return true;
  }
});

async function handleFetchImageBase64(request, sender, sendResponse) {
  try {
    const res = await fetch(request.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
        const subArray = bytes.subarray(i, i + chunk);
        binary += String.fromCharCode.apply(null, subArray);
    }
    const base64 = btoa(binary);
    sendResponse({ success: true, base64: base64 });
  } catch (e) {
    console.error("[BG] Failed to fetch and convert image to base64:", e);
    sendResponse({ success: false, error: e.message });
  }
}

async function handleLLMMarkingRequest(request, sender, sendResponse) {
  const logInfo = (msg) => {
      console.log(msg);
      if (sender && sender.tab) {
          chrome.tabs.sendMessage(sender.tab.id, { type: 'BG_LOG', message: msg }, { frameId: sender.frameId }).catch(() => {});
      }
  };

  try {
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['apiProvider', 'apiUrl', 'apiKey', 'modelName', 'courseName'], resolve);
    });

    const apiProvider = config.apiProvider || "openai";
    const apiUrl = config.apiUrl || "http://192.168.8.28:8000/v1/chat/completions";
    const apiKey = config.apiKey || "vllm-local";
    const modelName = config.modelName || "Qwen/Qwen3.5-9B";
    const payload = request.payload;
    const base64Image = payload.base64Image;
    const questionTitle = payload.questionTitle;
    const totalMaxScore = payload.totalMaxScore;
    const subQuestionsText = payload.subQuestionsText;
    const mainQuestionDesc = payload.mainQuestionDesc || "";
    const courseName = payload.courseName || config.courseName || "软件工程";

    const systemPrompt = `你是一位任教于大学【${courseName}】课程的资深教师。你需要对学生的答卷（图片形式）进行专业、公正且严格的批阅。
你的主要职责是分析学生的作答图片，对比标准答案，对每个小题分别进行打分、点评，并定位答题区域的视觉中心坐标位置。`;

    let userMessage = `
请扮演资深教师批阅以下学生的答题图片。这道题是【${questionTitle}】，总满分为【${totalMaxScore}】分。
`;

    if (mainQuestionDesc) {
        userMessage += `\n【大题整体背景题干与业务规则】：\n${mainQuestionDesc}\n`;
    }

    userMessage += `
【小题配置与参考标准答案】：
${subQuestionsText}

【任务要求】：
1. 认真审读学生的答题图片（可能包含手写解答文字、决策树图、决策表等）。**注意，学生答小题的顺序可能与出题配置不一致，且作答区域可能左右、上下或错落分布。请在整张图片中全局检索各小题对应的实际作答内容，并建立正确关联。**
2. 对照上述参考标准答案，对每个小题分别进行评分和点评：
   - 确定状态 "status"：若回答正确或基本正确，为 "correct"（在图中标记 ✓）；若完全错误或未作答，为 "incorrect"（在图中标记 ✗）；若部分正确（如有遗漏或细微错误），为 "partial"（在图中标记 ⍻）。
   - 给出得分 "score"：给出该小题的实得分数，不能超过该小题的最高分值。
   - 给出评语 "comment"：针对该小题答题情况提供中文简要点评（指出对错，不超过30个字）。
   - 估算位置 "x" 与 "y"：找出该小题作答在整张图片中的相对中心位置坐标（按百分比，0到100之间，其中 x 为距离左边缘的百分比，y 为距离上边缘的百分比）。**请确保坐标（x, y）精准落入该小题的实际作答区域内（用于精准盖章印章定位）**。如果小题作答区域上下分布，请返回不同的 y 坐标（例如小题1在顶部为 y=25，小题2在底部为 y=70）；如果左右分布，请返回不同的 x 坐标。
3. 必须输出符合以下 JSON Schema 的纯 JSON 数据，不得包含任何 Markdown 格式包裹（不要使用 \`\`\`json 标记），不要包含任何额外的问候、思考过程或解释文字。

【返回JSON数据格式示例】：
{
  "subQuestions": [
    {
      "id": "1",
      "status": "correct",
      "score": 5.0,
      "comment": "决策树分支正确，符号标准。",
      "x": 45,
      "y": 30
    },
    {
      "id": "2",
      "status": "partial",
      "score": 3.0,
      "comment": "决策表缺少规则4，其它规则正确。",
      "x": 50,
      "y": 70
    }
  ]
}
`;

    logInfo(`🚀 [AI Marking] Sending request to ${apiProvider} API: ${apiUrl}`);
    logInfo(`📦 [AI Marking] Payload Model: ${modelName}`);

    let response;
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image
      }
    };

    if (apiProvider === "gemini") {
      const baseUrl = apiUrl.replace(/\/v1beta.*$/, '').replace(/\/$/, '');
      const geminiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const geminiPayload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [
              { text: userMessage },
              imagePart
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      };

      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
    } else {
      // OpenAI / vLLM compatible model with Vision
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userMessage },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                    detail: "auto"
                  }
                }
              ]
            }
          ],
          temperature: 0.1
        })
      });
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`API responded with HTTP Status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    let textResult = "";

    if (apiProvider === "gemini") {
      textResult = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      textResult = resJson.choices?.[0]?.message?.content || "";
    }

    logInfo(`✅ [AI Marking] LLM Text generated successfully.`);
    
    // Parse the inner JSON block safely
    let cleanJsonText = textResult.trim();
    if (cleanJsonText.startsWith("```")) {
      cleanJsonText = cleanJsonText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const finalData = JSON.parse(cleanJsonText);
    sendResponse({ success: true, data: finalData });

  } catch (e) {
    console.error("❌ [AI Marking Background Error]:", e);
    sendResponse({ success: false, error: e.message });
  }
}
