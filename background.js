// background.js
importScripts('ncu_background_core.js');
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


