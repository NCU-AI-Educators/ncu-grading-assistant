// ncu_background_core.js — Shared Core NCU AI Marking Background Handlers

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
    const modelName = config.modelName || "Qwen/Qwen3.5-9B";    const payload = request.payload;
    const base64Image = payload.base64Image;
    const questionTitle = payload.questionTitle;
    const totalMaxScore = payload.totalMaxScore;
    const subQuestionsText = payload.subQuestionsText;
    const mainQuestionDesc = payload.mainQuestionDesc || "";
    const courseName = payload.courseName || config.courseName || "软件工程";
    const subQuestions = payload.subQuestions || [];

    // 找出所有带有标准答案图的小题图片
    const answerImages = [];
    subQuestions.forEach(sq => {
        if (sq.answerImage) {
            // 剔除 base64 协议头
            const base64Clean = sq.answerImage.replace(/^data:image\/\w+;base64,/, "");
            answerImages.push({
                id: sq.id,
                base64: base64Clean
            });
        }
    });

    const systemPrompt = `你是一位任教于大学【${courseName}】课程的资深教师。你需要对学生的答卷（图片形式）进行专业、公正且严格的批阅。
    你的主要职责是分析学生的作答图片，对比标准答案，对每个小题分别进行评分、点评。
    【填空题与公式题核心判分准则】：填空题与公式填空具有客观唯一性。学生的作答必须与参考答案完全等价。若有任何字母缺失、系数写错（例如漏写 3/4 ）、指数不对（例如 w^2 写成 w ）、或手写符号错误，一律属于错误，**必须直接判定为 "incorrect" 且得分必须直接给 0 分，绝对禁止给出 "partial"（部分正确）或任何折算分数**！唯一的例外是乘法交换律，即如果作答仅仅是因子乘积顺序不同（例如参考答案为 3/4*m*R^2*w^2，学生写为 m*w^2*R^2*3/4 ），应判定为 "correct" 并给满分。`;

    let userMessage = `
请扮演资深教师批阅以下学生的答题图片。这道题是【${questionTitle}】，总满分为【${totalMaxScore}】分。
`;

    if (mainQuestionDesc) {
        userMessage += `\n【大题整体背景题干与业务规则】：\n${mainQuestionDesc}\n`;
    }

    userMessage += `
【小题配置与参考标准答案】：
${subQuestionsText}
`;

    if (answerImages.length > 0) {
        userMessage += `\n【重要：关于多图输入与标准答案图】\n`;
        userMessage += `你总共会接收到 ${1 + answerImages.length} 张图片：\n`;
        userMessage += `- 第一张图片（图片1）是【学生的答卷图片】；\n`;
        answerImages.forEach((img, idx) => {
            userMessage += `- 第 ${idx + 2} 张图片（图片${idx + 2}）是【小题第${img.id}题的参考标准答案图】。\n`;
        });
        userMessage += `评分时，请先仔细提取并分析对应的标准答案图（图片2及以后）所展示的标准表达式、公式步骤或图表，然后与学生答卷（图片1）中对应小题的作答内容进行比对。对于有标准答案图的小题，其评分标准以图片展示的答案为准，忽略文本评分标准。\n`;
    }

    userMessage += `
【任务要求】：
1. 认真审读学生的答题图片（可能包含手写解答文字、决策树图、决策表等）。**注意，学生答小题的顺序可能与出题配置不一致，且作答区域可能左右、上下或错落分布。请在整张图片中全局检索各小题对应的实际作答内容，并建立正确关联。**
2. 进行【客观转录】：在评分前，你必须首先客观、原封不动地将图片中学生针对该小题的实际手写字迹转录为文本（填入 "studentAnswerOCR" 字段）。转录时**必须仅看图片，绝对禁止参考标准答案进行任何“脑补”或强行靠拢**。例如：若图片中学生手写分母清晰写为 \`2\`（如 \`3/2\`），你必须客观转录为 \`3/2\`，严禁转录为 \`3/4\`！若字母写得像 \`1\` 或是 \`l\`，必须客观转录为 \`1\` 或 \`l\`，严禁脑补为 \`R\`。
3. 对照上述参考标准答案，对每个小题分别进行评分 and 点评：
   - 确定状态 "status"：若回答正确或基本正确，为 "correct"（在图中标记 ✓）；若完全错误或未作答，为 "incorrect"（在图中标记 ✗）。**注意：对于填空题与客观公式题，凡是与参考答案不一致的（除仅因乘法交换律致因子顺序不同外），必须直接判定为 "incorrect"，严禁判为 "partial"！** 只有在主观简答题部分正确时，才允许判定为 "partial" (在图中标记 ⍻)。
   - 给出得分 "score"：给出该小题的实得分数。注意：若状态判定为 "incorrect"，其得分必须直接给 0 分；实得分数不能超过该小题的最高分值。
   - 给出评语 "comment"：针对该小题答题情况提供中文简要点评（指出对错，不超过30个字）。
   - 估算位置 "x" 与 "y"：找出该小题作答在整张图片中的相对中心位置坐标（按百分比，0到100之间，其中 x 为距离左边缘的百分比，y 为距离上边缘的百分比）。
4. **【填空题与公式严苛批阅规则】**：
   - **严格匹配原则**：对于填空题，学生作答（即你转录出的 "studentAnswerOCR"）凡是与参考标准答案不一致的，必须直接判定为 **"incorrect"（错误，得 0 分）**。严禁将漏写系数、指数写错、字母缺失或错误等情况判定为 \`"partial"\`（部分正确）或给予折算分。
   - **乘法交换律例外**：唯一的例外是**“因子可交换顺序”**。如果学生作答仅仅是乘积因子的书写顺序与参考答案不同（例如参考答案是 \`3/4*m*R^2*w^2\`，学生写为 \`m*w^2*R^2*3/4\` 等且数学/物理意义完全等价），**必须判定为 "correct"（正确，给满分）**。
   - **小心手写混淆与数值核对**：细致甄别手写体容易混淆的字符（例如手写的 \`w\`、\`r\`、\`v\` 以及大小写 \`R\`/\`r\`）。特别注意区分相邻字母与上标的对应关系。对于公式中的常数与分式（如 \`3/4\`），必须逐一精确核对手写体中分子 and 分母的数字（如区分手写数字 \`2\`、\`4\`、\`9\` 等）。例如，当参考答案分母是 \`4\`（如 \`3/4\`）而学生手写分母为 \`2\`（即 \`3/2\`）时，一律属于严重错误，必须判定为 **"incorrect"（错误，得 0 分）**，绝不容许因为字母一样或字迹而主观猜测或放宽标准。若确认手写作答拼写有误（如将 \`R\` 误写成了 \`1\` 或是 \`l\`），同样一律判定为 **"incorrect"（错误，得 0 分）**。
5. 必须输出符合以下 JSON Schema 的纯 JSON 数据，不得包含任何 Markdown 格式包裹（不要使用 \`\`\`json 标记），不要包含 any 额外的问候、思考过程或解释文字。

【返回JSON数据格式示例】：
{
  "subQuestions": [
    {
      "id": "1",
      "studentAnswerOCR": "[学生该小题作答的原始文字/公式转录结果]",
      "status": "correct",
      "score": 5.0,
      "comment": "[针对学生该小题答题情况的简要中文评语]",
      "x": 45,
      "y": 30
    },
    {
      "id": "2",
      "studentAnswerOCR": "[学生该小题作答的原始文字/公式转录结果]",
      "status": "incorrect",
      "score": 0.0,
      "comment": "[针对学生该小题答题情况的简要错误点评]",
      "x": 50,
      "y": 70
    }
  ]
}
`;

    logInfo(`🚀 [AI Marking] Sending request to ${apiProvider} API: ${apiUrl}`);
    logInfo(`📦 [AI Marking] Payload Model: ${modelName}`);

    let response;

    if (apiProvider === "gemini") {
      const baseUrl = apiUrl.replace(/\/v1beta.*$/, '').replace(/\/$/, '');
      const geminiUrl = `${baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const geminiParts = [{ text: userMessage }];
      
      // 第一张：学生作答图片
      geminiParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      });

      // 后置：标准答案图片
      answerImages.forEach(img => {
        geminiParts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: img.base64
          }
        });
      });

      const geminiPayload = {
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: geminiParts
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
      const userContent = [{ type: "text", text: userMessage }];
      
      // 第一张：学生作答图片
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
          detail: "auto"
        }
      });

      // 后置：标准答案图片
      answerImages.forEach(img => {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${img.base64}`,
            detail: "auto"
          }
        });
      });

      const requestBody = {
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: userContent
          }
        ],
        temperature: 0.1,
        max_tokens: 1500
      };

      if (apiProvider === "siliconflow" || (apiUrl && apiUrl.includes("siliconflow"))) {
        requestBody.enable_thinking = false;
      }

      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
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
    let friendlyError = e.message;
    if (friendlyError && (friendlyError.includes("Failed to fetch") || friendlyError.includes("fetch") || friendlyError.includes("NetworkError"))) {
      friendlyError = `网络连接失败 (Failed to fetch)。\n请点击浏览器右上角“高校 AI 教务助手”插件图标，检查以下配置：\n1. API URL 是否正确且当前网络可访问 (当前配置为: ${apiUrl})\n2. API Key 是否已填入且有效\n3. 如果是本地/局域网服务，请确保服务已正常启动。`;
    }
    sendResponse({ success: false, error: friendlyError });
  }
}
