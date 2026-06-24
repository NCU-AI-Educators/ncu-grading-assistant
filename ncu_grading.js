let currentQTitle = "";

async function ncuSetToolInMainWorld(toolType) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'NCU_SET_TOOL',
            payload: { toolType: toolType }
        }, (response) => {
            console.log(`[NCU Grading Debug] Main world set tool callback:`, response);
            resolve(response);
        });
    });
}

async function ncuClearMarkingsInMainWorld() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            type: 'NCU_CLEAR_MARKINGS'
        }, (response) => {
            console.log(`[NCU Grading Debug] Main world clear markings callback:`, response);
            resolve(response);
        });
    });
}

function ncuInit() {
    if (window._aiNcuGradingInitialized) return;
    window._aiNcuGradingInitialized = true;
    console.log("🟢 [NCU Grading] Initializing AI marking widget...");

    // 注入 Main World 全局诊断，直接输出核心函数的完整源代码，绕过 CSP 限制
    chrome.runtime.sendMessage({
        type: 'EXECUTE_IN_MAIN_WORLD'
    }, response => {
        console.log("[NCU Grading] Main world global source diagnostics initiated:", response);
    });

    ncuInjectGradingPanel();
}

function ncuFindSubmitBtn() {
    const byId = document.getElementById('bnt_submit') ||
        document.getElementById('btn_submit') ||
        document.getElementById('submit') ||
        document.getElementById('btnSubmit');
    if (byId) return byId;

    const elements = Array.from(document.querySelectorAll('button, a, input[type="button"], div, span'));
    return elements.find(el => {
        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && el.children.length > 2) {
            return false;
        }
        const text = (el.innerText || el.textContent || "").trim();
        return text === '提交分数' || text.includes('提交分数') || text === '提交分' || text === '保存分数';
    });
}

function ncuEnableDrag(panel, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (panel.classList.contains('docked')) return;
        e = e || window.event;
        if (e.target.closest('button') || e.target.id === 'ncu-minimize-btn' || e.target.closest('.ncu-sub-item')) return;

        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        if (panel.classList.contains('docked')) {
            closeDragElement();
            return;
        }
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        let newTop = panel.offsetTop - pos2;
        let newLeft = panel.offsetLeft - pos1;

        newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - panel.offsetWidth));

        panel.style.top = newTop + "px";
        panel.style.left = newLeft + "px";
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function ncuInjectGradingPanel() {
    if (document.getElementById('ncu-ai-grading-panel')) return;

    const css = `
      .ncu-ai-panel {
          background: rgba(20, 24, 33, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          color: #f0f2f5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
          box-sizing: border-box;
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 300px;
          z-index: 999999;
      }
      .ncu-ai-panel.collapsed {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          cursor: pointer;
          background: linear-gradient(135deg, #0072ff, #00c6ff);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0, 114, 255, 0.4);
      }
      .ncu-ai-panel-header {
          padding: 8px 12px;
          background: linear-gradient(135deg, rgba(0, 114, 255, 0.15), rgba(0, 198, 255, 0.15));
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
      }
      .ncu-ai-panel-title {
          font-weight: bold;
          font-size: 13px;
          background: linear-gradient(120deg, #00c6ff, #0072ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          display: flex;
          align-items: center;
          gap: 6px;
      }
      .ncu-ai-panel-body {
          padding: 12px;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
      }
      .ncu-ai-panel-body::-webkit-scrollbar {
          width: 4px;
      }
      .ncu-ai-panel-body::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
      }
      .ncu-ai-form-group {
          margin-bottom: 10px;
      }
      .ncu-ai-label {
          display: block;
          font-size: 11px;
          color: #a0aec0;
          margin-bottom: 3px;
          font-weight: 500;
      }
      .ncu-ai-input {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: #e2e8f0;
          padding: 4px 6px;
          font-size: 11px;
          box-sizing: border-box;
          transition: all 0.2s;
      }
      .ncu-ai-textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: #e2e8f0;
          padding: 4px 6px;
          font-size: 11px;
          box-sizing: border-box;
          height: 120px;
          resize: vertical;
          font-family: inherit;
          transition: all 0.2s;
      }
      .ncu-ai-input:focus, .ncu-ai-textarea:focus {
          border-color: #00c6ff;
          outline: none;
          background: rgba(255, 255, 255, 0.1);
      }
      .ncu-ai-btn {
          width: 100%;
          padding: 6px 10px;
          border-radius: 6px;
          border: none;
          background: linear-gradient(135deg, #0072ff, #00c6ff);
          color: white;
          font-weight: bold;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
      }
      .ncu-ai-btn:hover {
          filter: brightness(1.15);
      }
      .ncu-ai-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #e2e8f0;
      }
      .ncu-ai-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
      }
      .ncu-sub-item {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          padding: 6px;
          margin-bottom: 6px;
          position: relative;
      }
      .ncu-sub-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2px;
      }
      .ncu-remove-btn {
          color: #f56c6c;
          cursor: pointer;
          font-size: 10px;
          font-weight: bold;
      }
      .ncu-remove-btn:hover {
          text-decoration: underline;
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.innerText = css;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'ncu-ai-grading-panel';
    panel.className = 'ncu-ai-panel';

    let isCollapsed = false;

    const renderPanelContent = () => {
        if (isCollapsed) {
            panel.className = 'ncu-ai-panel collapsed';
            panel.innerHTML = `<span style="font-size: 20px; line-height: 1;">🤖</span>`;
            panel.onclick = () => {
                isCollapsed = false;
                panel.onclick = null;
                renderPanelContent();
            };
        } else {
            panel.className = 'ncu-ai-panel';
            panel.onclick = null;
            panel.innerHTML = `
  <div class="ncu-ai-panel-header">
      <div class="ncu-ai-panel-title">🤖 NCU 智能阅卷助手</div>
      <div style="cursor: pointer; font-size: 12px; display: flex; gap: 8px;">
          <span id="ncu-minimize-btn" title="最小化">➖</span>
      </div>
  </div>
  <div class="ncu-ai-panel-body">
      <div class="ncu-ai-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="ncu-ai-label">当前识别题目：</span>
              <span id="ncu-detected-q" style="font-weight: bold; color: #00c6ff; font-size: 12px;">检测中...</span>
          </div>
      </div>
      
      <div class="ncu-ai-form-group">
          <span class="ncu-ai-label">大题背景题干/业务规则说明：</span>
          <textarea class="ncu-main-question-desc ncu-ai-textarea" id="ncu-main-q-desc" style="height: 90px; margin-bottom: 6px;" placeholder="（可选）在此输入本大题业务规则，例如促销折扣标准描述，协助 AI 准确对照阅卷..."></textarea>
      </div>
      
      <div class="ncu-ai-form-group">
          <span class="ncu-ai-label">小题评分配置：</span>
          <div id="ncu-sub-questions-list"></div>
          <button type="button" class="ncu-ai-btn ncu-ai-btn-secondary" id="ncu-add-sub-btn" style="padding: 3px 6px; font-size: 10px; margin-top: 4px;">➕ 添加小题</button>
      </div>
      
      <button type="button" class="ncu-ai-btn" id="ncu-start-grade-btn">🤖 开始智能阅卷</button>
      <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button type="button" class="ncu-ai-btn ncu-ai-btn-secondary" id="ncu-test-canvas-btn" style="flex: 1; padding: 6px 2px; font-size: 11px; margin-top: 0;">🎨 测试画布批注</button>
          <button type="button" class="ncu-ai-btn ncu-ai-btn-secondary" id="ncu-diagnose-btn" style="flex: 1; padding: 6px 2px; font-size: 11px; margin-top: 0;">📋 复制 DOM 诊断</button>
      </div>
  </div>
`;

            const minimizeBtn = panel.querySelector('#ncu-minimize-btn');
            minimizeBtn.onclick = (e) => {
                e.stopPropagation();
                isCollapsed = true;
                renderPanelContent();
            };

            const addSubBtn = panel.querySelector('#ncu-add-sub-btn');
            addSubBtn.onclick = () => {
                const list = panel.querySelector('#ncu-sub-questions-list');
                const items = list.querySelectorAll('.ncu-sub-item');
                const nextId = String(items.length + 1);
                ncuAddSubQuestionElement(list, { id: nextId, maxScore: 5, answer: "" });
                ncuSaveConfig();
            };

            const startGradeBtn = panel.querySelector('#ncu-start-grade-btn');
            startGradeBtn.onclick = ncuStartGrading;

            const testCanvasBtn = panel.querySelector('#ncu-test-canvas-btn');
            testCanvasBtn.onclick = ncuRunCanvasTest;

            const diagnoseBtn = panel.querySelector('#ncu-diagnose-btn');
            diagnoseBtn.onclick = () => {
                const report = generateDOMDiagnostics();
                copyToClipboard(report);
            };

            const header = panel.querySelector('.ncu-ai-panel-header');
            if (header) {
                ncuEnableDrag(panel, header);
            }

            const mainQDescInput = panel.querySelector('#ncu-main-q-desc');
            if (mainQDescInput) {
                mainQDescInput.oninput = ncuSaveConfig;
            }

            const qTitle = ncuDetectQuestionTitle();
            panel.querySelector('#ncu-detected-q').innerText = qTitle || '第三题';
            currentQTitle = qTitle;
            loadSubQuestionsConfig();
        }
    };

    renderPanelContent();
    document.body.appendChild(panel);
    console.log("🟢 [NCU Grading] AI marking widget loaded as floating panel.");

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('examId') || 'unknown';

    setInterval(() => {
        const activePanel = document.getElementById('ncu-ai-grading-panel');
        if (!activePanel) return;

        if (isCollapsed) return;

        const newTitle = ncuDetectQuestionTitle();
        if (newTitle && newTitle !== currentQTitle) {
            currentQTitle = newTitle;
            const qLabel = activePanel.querySelector('#ncu-detected-q');
            if (qLabel) qLabel.innerText = currentQTitle;
            loadSubQuestionsConfig();
        }
    }, 1000);
}

function ncuAddSubQuestionElement(container, data) {
    const item = document.createElement('div');
    item.className = 'ncu-sub-item';
    item.dataset.id = data.id;

    item.innerHTML = `
      <div class="ncu-sub-item-header">
          <span style="font-weight: bold; font-size: 11px; color: #00c6ff;">第${data.id}小题</span>
          <span class="ncu-remove-btn">删除</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
          <span class="ncu-ai-label" style="margin-bottom: 0;">分值:</span>
          <input type="number" class="ncu-sub-max-score ncu-ai-input" style="width: 50px;" value="${data.maxScore}">
      </div>
      <span class="ncu-ai-label">评分标准:</span>
      <textarea class="ncu-sub-answer ncu-ai-textarea" placeholder="输入该小题评分标准...">${data.answer}</textarea>
    `;

    item.querySelector('.ncu-remove-btn').onclick = () => {
        item.remove();
        const items = container.querySelectorAll('.ncu-sub-item');
        items.forEach((it, idx) => {
            const newId = String(idx + 1);
            it.dataset.id = newId;
            it.querySelector('.ncu-sub-item-header span').innerText = `第${newId}小题`;
        });
        ncuSaveConfig();
    };

    item.querySelector('.ncu-sub-max-score').oninput = ncuSaveConfig;
    item.querySelector('.ncu-sub-answer').oninput = ncuSaveConfig;

    container.appendChild(item);
}

function ncuSaveConfig() {
    const list = document.querySelector('#ncu-sub-questions-list');
    if (!list) return;
    const subQuestions = [];
    const items = list.querySelectorAll('.ncu-sub-item');
    items.forEach(item => {
        const id = item.dataset.id;
        const maxScoreInput = item.querySelector('.ncu-sub-max-score');
        const answerInput = item.querySelector('.ncu-sub-answer');
        if (maxScoreInput && answerInput) {
            subQuestions.push({
                id: id,
                maxScore: parseFloat(maxScoreInput.value) || 0,
                answer: answerInput.value
            });
        }
    });

    const descInput = document.querySelector('#ncu-main-q-desc');
    const mainDesc = descInput ? descInput.value : "";

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('examId') || 'unknown';
    const key = `ncu_grading_${examId}_${currentQTitle}`;
    const descKey = `ncu_grading_desc_${examId}_${currentQTitle}`;
    chrome.storage.local.set({
        [key]: subQuestions,
        [descKey]: mainDesc
    });
}

function loadSubQuestionsConfig() {
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('examId') || 'unknown';
    const key = `ncu_grading_${examId}_${currentQTitle}`;
    const descKey = `ncu_grading_desc_${examId}_${currentQTitle}`;
    chrome.storage.local.get([key, descKey], (data) => {
        const config = data[key] || ncuGetDefaultConfig();
        const mainDesc = data[descKey] !== undefined ? data[descKey] : ncuGetDefaultMainDesc();

        const descInput = document.querySelector('#ncu-main-q-desc');
        if (descInput) {
            descInput.value = mainDesc;
        }

        const list = document.querySelector('#ncu-sub-questions-list');
        if (list) {
            ncuRenderSubQuestions(config);
        }
    });
}

function ncuGetDefaultMainDesc() {
    if (currentQTitle.includes('三') || currentQTitle.includes('3')) {
        return `某百货公司为促销，根据最近三年内有无欠款交易关系、有无交易折扣关系以及交易历史（10年以上）等条件，制定以下折扣率标准：\n1. 最近三年内无欠款且有交易折扣关系的客户折扣率为15%。\n2. 最近三年内无欠款、无折扣关系且与该百货公司有10年以上交易历史的客户折扣率为10%。\n3. 其它客户折扣率为5%。`;
    }
    return "";
}

function ncuGetDefaultConfig() {
    if (currentQTitle.includes('三') || currentQTitle.includes('3')) {
        return [
            { id: "1", maxScore: 5, answer: "【决策树】应包含根节点“最近三年内是否存在无折扣交易关系”，是则输出折扣率为15%。否则判断“是否与该用户有10年及以上交易关系”，是则10%，否则5%。" },
            { id: "2", maxScore: 5, answer: "【决策表】条件为：无折扣/交易额>5万元；无折扣/最近三年内无欠款；是否10年交易。决策项：无折扣，折扣5%，10%，15%。应包含规则1、规则2、规则3、规则4。" }
        ];
    }
    return [
        { id: "1", maxScore: 5, answer: "" },
        { id: "2", maxScore: 5, answer: "" }
    ];
}

function ncuRenderSubQuestions(config) {
    const list = document.querySelector('#ncu-sub-questions-list');
    if (!list) return;
    list.innerHTML = "";
    config.forEach(data => {
        ncuAddSubQuestionElement(list, data);
    });
}

function generateDOMDiagnostics() {
    const report = [];
    report.push(`=== NCU ONLINE MARKING DOM DIAGNOSTIC REPORT ===`);
    report.push(`URL: ${window.location.href}`);
    report.push(`Title: ${document.title}`);
    report.push(`Local Time: ${new Date().toLocaleString()}`);
    report.push(``);

    const canvases = Array.from(document.querySelectorAll('canvas'));
    report.push(`[Canvas Elements] Total: ${canvases.length}`);
    canvases.forEach((c, idx) => {
        const rect = c.getBoundingClientRect();
        report.push(`  Canvas ${idx + 1}: ID="${c.id}" Class="${c.className}" Size=${rect.width}x${rect.height}`);
    });
    report.push(``);

    const imgs = Array.from(document.querySelectorAll('img'));
    report.push(`[Image Elements] Total: ${imgs.length}`);
    imgs.forEach((img, idx) => {
        const rect = img.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) {
            report.push(`  Image ${idx + 1}: ID="${img.id}" Class="${img.className}" Size=${rect.width}x${rect.height} Src="${img.src.substring(0, 100)}..."`);
        }
    });
    report.push(``);

    // 扫描所有带有 AnnotationType 名字或者类似标注性质的工具栏按钮
    const annotationTypeEls = Array.from(document.querySelectorAll('[name*="AnnotationType"], [name*="annotation"], [class*="AnnotationType"], [class*="annotation"]'));
    report.push(`[AnnotationType / Annotation Elements] Total: ${annotationTypeEls.length}`);
    annotationTypeEls.forEach((el, idx) => {
        report.push(`  El ${idx + 1}: Tag=${el.tagName} name="${el.getAttribute('name') || ''}" type="${el.getAttribute('type') || ''}" class="${el.className}" id="${el.id}" OuterHTML="${el.outerHTML.substring(0, 200)}"`);
    });
    report.push(``);

    const elements = Array.from(document.querySelectorAll('div, span, button, a, li, i, p'));
    const symbols = ['✓', '✗', '⍻', 'Ta', '清空'];
    report.push(`[Toolbar Button Matches]`);
    symbols.forEach(sym => {
        const found = elements.filter(el => {
            if (el.children.length > 0) return false;
            const text = (el.innerText || el.textContent || "").trim();
            return text === sym || text.includes(sym);
        });
        report.push(`  Symbol "${sym}": ${found.length} matches`);
        found.forEach((el, idx) => {
            report.push(`    Match ${idx + 1}: Tag=${el.tagName} ID="${el.id}" Class="${el.className}" OuterHTML="${el.outerHTML.substring(0, 150)}"`);
        });
    });
    report.push(``);

    const inputs = Array.from(document.querySelectorAll('input'));
    report.push(`[Input Elements] Total: ${inputs.length}`);
    inputs.forEach((inp, idx) => {
        const rect = inp.getBoundingClientRect();
        report.push(`  Input ${idx + 1}: Tag=${inp.tagName} Type="${inp.type}" ID="${inp.id}" Class="${inp.className}" Placeholder="${inp.placeholder || ''}" Value="${inp.value || ''}" Rect=[left:${rect.left},top:${rect.top},width:${rect.width},height:${rect.height}]`);
    });
    report.push(``);

    const manfenElements = elements.filter(el => {
        if (el.children.length > 0) return false;
        const text = (el.innerText || el.textContent || "").trim();
        return text.includes('满分');
    });
    report.push(`['满分' Matches] Total: ${manfenElements.length}`);
    manfenElements.forEach((el, idx) => {
        report.push(`  Match ${idx + 1}: Tag=${el.tagName} Text="${(el.innerText || el.textContent || "").trim()}" Class="${el.className}" HTML="${el.outerHTML.substring(0, 150)}"`);
    });
    report.push(``);

    report.push(`[Top-level layout containers]`);
    const layouts = Array.from(document.querySelectorAll('body > div, #app > div, .wrapper > div'));
    layouts.forEach((el, idx) => {
        report.push(`  Container ${idx + 1}: Tag=${el.tagName} ID="${el.id}" Class="${el.className}"`);
    });

    return report.join('\n');
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert("📋 DOM 结构诊断报告已成功复制到剪贴板！请粘贴发回给 AI 助手。");
        }).catch(err => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        alert("📋 DOM 结构诊断报告已成功复制到剪贴板！请粘贴发回给 AI 助手。");
    } catch (e) {
        console.error("Fallback copy failed:", e);
        alert("复制失败，请在控制台查看报告详情。");
    }
    document.body.removeChild(ta);
}

function ncuFindToolbarButton(symbol) {
    // 调试打印：输出当前页面所有含有 AnnotationType 属性或类名的元素
    const debugAnnotationEls = Array.from(document.querySelectorAll('[name*="AnnotationType"], [class*="AnnotationType"]'));
    if (debugAnnotationEls.length > 0) {
        console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) - Found AnnotationType elements on page:`,
            debugAnnotationEls.map(el => `Tag=${el.tagName} name="${el.getAttribute('name')}" type="${el.getAttribute('type')}" class="${el.className}" id="${el.id}" OuterHTML="${el.outerHTML.substring(0, 100)}"`));

        // 自动计算最近公共祖先（即工具栏大容器）
        let lca = debugAnnotationEls[0].parentElement;
        while (lca) {
            const containsAll = debugAnnotationEls.every(el => lca.contains(el));
            if (containsAll) break;
            lca = lca.parentElement;
        }
        if (lca) {
            const lcaRect = lca.getBoundingClientRect();
            console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) - Detected LCA Toolbar Container: <${lca.tagName.toLowerCase()}> id="${lca.id || ''}" class="${lca.className || ''}" size=${lcaRect.width}x${lcaRect.height} bounding=`, JSON.stringify(lcaRect));
        }
    } else {
        console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) - No elements found matching [name*="AnnotationType"] or [class*="AnnotationType"]`);
    }

    let possibleTypes = [];
    if (symbol === '✓') possibleTypes = ['right', 'correct', 'yes', 'ok'];
    else if (symbol === '✗') possibleTypes = ['wrong', 'incorrect', 'no', 'error'];
    else if (symbol === '⍻') possibleTypes = ['half', 'part'];
    else if (symbol === 'Ta') possibleTypes = ['edit', 'text', 'word', 'font', 'comment', 'write', 'ta', 'txt'];
    else if (symbol === '清空') possibleTypes = ['empty', 'clear', 'clean'];

    if (possibleTypes.length > 0) {
        for (const t of possibleTypes) {
            let btn = document.querySelector(`[name="AnnotationType"][type="${t}"]`) ||
                document.querySelector(`[name="AnnotationType"][type*="${t}"]`);
            if (btn) {
                console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) matched via [name="AnnotationType"][type*="${t}"]:`, btn.outerHTML.substring(0, 150));
                return btn;
            }
        }

        for (const t of possibleTypes) {
            let typeBtn = document.querySelector(`[type="${t}"]`);
            if (typeBtn && !['input', 'textarea'].includes(typeBtn.tagName.toLowerCase())) {
                console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) matched via [type="${t}"]:`, typeBtn.outerHTML.substring(0, 150));
                return typeBtn;
            }
        }

        if (symbol === '清空') {
            const clearBtn = document.getElementById('bnt_clear') || document.querySelector('.empty');
            if (clearBtn) {
                console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) matched clear button via ID/class:`, clearBtn.outerHTML.substring(0, 150));
                return clearBtn;
            }
        }
    }

    // 综合元素搜索：涵盖按钮、链接、div、span等标签
    const candidates = Array.from(document.querySelectorAll('button, a, div, span, i, li, p'));

    // 语义匹配助手函数
    const matchesSymbol = (str, className = '', id = '', tagName = '') => {
        str = str.trim();
        className = className.toLowerCase();
        id = id.toLowerCase();
        tagName = tagName.toLowerCase();

        // 判定该节点或它的属性是否表明它是一个交互性图标、按钮
        const isInteractive = ['button', 'a', 'i', 'span'].includes(tagName) ||
            className.includes('btn') || className.includes('button') || className.includes('tool') || className.includes('stamp') || className.includes('icon') || className.includes('item') || className.includes('clear') || className.includes('action') || className.includes('clickable') ||
            id.includes('btn') || id.includes('button') || id.includes('tool') || id.includes('clear');

        if (symbol === '✓') {
            const hasRightWord = str === '✓' || str === '✔' || str === '对' || str.includes('correct') || className.includes('right') || className.includes('correct') || id.includes('correct');
            return hasRightWord && isInteractive;
        }
        if (symbol === '✗') {
            const hasWrongWord = str === '✗' || str === '✘' || str === '错' || str.includes('incorrect') || className.includes('wrong') || className.includes('incorrect') || id.includes('incorrect');
            return hasWrongWord && isInteractive;
        }
        if (symbol === '⍻') {
            const hasHalfWord = str === '⍻' || str === '半对' || className.includes('half') || id.includes('half');
            return hasHalfWord && isInteractive;
        }
        if (symbol === 'Ta') {
            // 文字标注工具：检查文字，且严格保证不是单纯用来做数字标签或fsText之类字体的非按钮元素
            const hasTextWord = str === 'Ta' || str === 'T' || str === '文' || str.includes('text') || className.includes('text') || id.includes('text');
            const isTextBtn = className.includes('btn') || className.includes('button') || className.includes('tool') || className.includes('stamp') || className.includes('icon') || className.includes('clickable') ||
                id.includes('btn') || id.includes('button') || id.includes('tool') ||
                str === 'Ta' || str === 'T' || str === '文';
            return hasTextWord && isTextBtn;
        }
        if (symbol === '清空') {
            const hasClearWord = str === '清空' || str.includes('清除') || className.includes('clear') || id.includes('clear') || id === 'bnt_clear';
            return hasClearWord && isInteractive;
        }
        return false;
    };

    // 阶段 1：查找无子节点的直接叶子元素（优先匹配精准文字）
    const leafMatch = candidates.find(el => {
        if (el.children.length > 0) return false;
        const text = (el.innerText || el.textContent || "").trim();
        return matchesSymbol(text, el.className || '', el.id || '', el.tagName);
    });

    // 阶段 2：查找其类名或 ID 匹配的任何元素（如带图标的 <button class="btn-right">）
    const attrMatch = candidates.find(el => {
        const className = typeof el.className === 'string' ? el.className : '';
        const id = typeof el.id === 'string' ? el.id : '';
        const tagName = el.tagName.toLowerCase();

        // 若为 div/li/p 等容器元素，仅当类名或 id 具有明确的按钮、工具、盖章等交互标识时才允许匹配，以防误匹配布局容器（如 right-panel）
        if (['div', 'li', 'p'].includes(tagName)) {
            const isInteractive = className.includes('btn') || className.includes('button') || className.includes('tool') || className.includes('stamp') || className.includes('icon') || className.includes('item') || className.includes('mark') || className.includes('clear') || className.includes('action') || className.includes('clickable') ||
                id.includes('btn') || id.includes('button') || id.includes('tool') || id.includes('clear');
            if (!isInteractive) return false;
        }

        return matchesSymbol('', className, id, el.tagName);
    });

    // 阶段 3：兜底匹配带有匹配文字的较小元素（字数不超过10字，避免匹配外层大容器）
    const textMatch = candidates.find(el => {
        const text = (el.innerText || el.textContent || "").trim();
        if (text.length > 10) return false;
        return matchesSymbol(text, el.className || '', el.id || '', el.tagName);
    });

    const matchedEl = leafMatch || attrMatch || textMatch;
    if (matchedEl) {
        let matchSource = leafMatch ? "Phase 1 (Leaf text)" : (attrMatch ? "Phase 2 (Attribute)" : "Phase 3 (Fallback text)");
        console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) base match found via ${matchSource}:`, matchedEl.outerHTML.substring(0, 150));

        // 向上搜寻最多3级父元素，若被包裹在 button、a 标签或带有点击交互类名的元素中，优先返回该交互包装元素
        let current = matchedEl;
        for (let i = 0; i < 3 && current; i++) {
            const tagName = current.tagName.toLowerCase();
            const className = typeof current.className === 'string' ? current.className : '';
            if (['button', 'a'].includes(tagName) || className.includes('btn') || className.includes('button') || className.includes('tool') || className.includes('stamp') || className.includes('clickable')) {
                if (current !== matchedEl) {
                    console.log(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) resolved to clickable ancestor wrapper:`, current.outerHTML.substring(0, 150));
                }
                return current;
            }
            current = current.parentElement;
        }
        return matchedEl;
    }

    console.warn(`[NCU Grading Debug] ncuFindToolbarButton(${symbol}) failed to match any element!`);
    return null;
}

function ncuFindMainCanvas() {
    const img = document.querySelector('.topic-img');
    if (img) return img;

    const canvases = Array.from(document.querySelectorAll('canvas'));
    if (canvases.length > 0) {
        canvases.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return (rectB.width * rectB.height) - (rectA.width * rectA.height);
        });
        return canvases[0];
    }

    const imgs = Array.from(document.querySelectorAll('img'));
    if (imgs.length > 0) {
        const visibleImgs = imgs.filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 200 && rect.height > 200 && !el.closest('#ncu-ai-grading-panel');
        });
        visibleImgs.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return (rectB.width * rectB.height) - (rectA.width * rectA.height);
        });
        return visibleImgs[0];
    }
    return null;
}

function ncuFindSpawnedInput() {
    // 助手函数：判断元素是否是主打分栏的输入框（避免误填入主分值输入框导致覆盖总分）
    const isTotalScoreInput = (el) => {
        const ph = (el.getAttribute('placeholder') || '').trim();
        const id = el.id || '';
        const className = typeof el.className === 'string' ? el.className : '';
        return id.includes('txt_marking_') || className.includes('score') || className.includes('scores') || ph.includes('满分');
    };

    console.log(`[NCU Grading Debug] ncuFindSpawnedInput: activeElement =`, document.activeElement ? `${document.activeElement.tagName} class="${document.activeElement.className}"` : "null");

    if (document.activeElement && (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT')) {
        if (!document.activeElement.closest('#ncu-ai-grading-panel') && !isTotalScoreInput(document.activeElement)) {
            console.log(`[NCU Grading Debug] Active element matches annotation input!`);
            return document.activeElement;
        }
    }

    const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])'));
    const visibleInputs = inputs.filter(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        if (el.closest('#ncu-ai-grading-panel')) return false;
        if (isTotalScoreInput(el)) return false;

        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });

    if (visibleInputs.length > 0) {
        // 优先寻找内容为空的最后一个输入框（代表刚刚生成、尚未被填写的输入框）
        const emptyInputs = visibleInputs.filter(el => el.value.trim() === '');
        if (emptyInputs.length > 0) {
            return emptyInputs[emptyInputs.length - 1];
        }
        // 降级：如果全部都被填过，则认为最新生成的在 DOM 树的最后端
        return visibleInputs[visibleInputs.length - 1];
    }
    return null;
}

async function ncuClickElementPhysically(el) {
    if (!el) return;

    // 自动寻找有物理大小的元素（宽度和高度均大于 5px），以便计算物理中心位置
    let sizeEl = el;
    let rect = sizeEl.getBoundingClientRect();
    let depth = 0;
    while (sizeEl && (rect.width <= 5 || rect.height <= 5) && depth < 5) {
        console.log(`[NCU Grading Debug] Element <${sizeEl.tagName.toLowerCase()}> is too small (${rect.width}x${rect.height}). Climbing up to parent...`);
        sizeEl = sizeEl.parentElement;
        if (sizeEl) {
            rect = sizeEl.getBoundingClientRect();
        }
        depth++;
    }

    if (!sizeEl) {
        sizeEl = el;
        rect = el.getBoundingClientRect();
    }

    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    console.log(`[NCU Grading Debug] ncuClickElementPhysically on <${el.tagName.toLowerCase()}> (orig type="${el.getAttribute('type') || ''}") using clientX=${clientX} clientY=${clientY} (calculated from <${sizeEl.tagName.toLowerCase()}> class="${sizeEl.className}")`);

    // 1. 派发 down 事件 (PointerDown & MouseDown) 到原始元素 el
    const button = 0;
    const buttons = 1;

    if (typeof window.PointerEvent === 'function') {
        const pevtDown = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            screenX: clientX + window.screenX,
            screenY: clientY + window.screenY,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            pressure: 0.5,
            button: button,
            buttons: buttons
        });
        el.dispatchEvent(pevtDown);
    }

    const mevtDown = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        screenX: clientX + window.screenX,
        screenY: clientY + window.screenY,
        button: button,
        buttons: buttons
    });
    el.dispatchEvent(mevtDown);

    // 模拟按压延迟 (50ms) - 确保拖动检测能够区分并处理这个完整的点击周期
    await new Promise(r => setTimeout(r, 50));

    // 2. 派发 up 事件 (PointerUp & MouseUp) 到原始元素 el，同时派发到 document 和 window 释放潜在的拖拽粘滞
    if (typeof window.PointerEvent === 'function') {
        const pevtUp = new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clientX,
            clientY: clientY,
            screenX: clientX + window.screenX,
            screenY: clientY + window.screenY,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            pressure: 0,
            button: 0,
            buttons: 0
        });
        el.dispatchEvent(pevtUp);
        document.dispatchEvent(pevtUp);
    }

    const mevtUp = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        screenX: clientX + window.screenX,
        screenY: clientY + window.screenY,
        button: 0,
        buttons: 0
    });
    el.dispatchEvent(mevtUp);
    document.dispatchEvent(mevtUp);
    window.dispatchEvent(mevtUp);

    // 稍微延迟 15ms，留出时间给可能运行在 macro/micro-task 里的拖拽状态机去完整处理释放逻辑
    await new Promise(r => setTimeout(r, 15));

    // 3. 派发 click 事件和原生 click() 到原始元素 el
    el.click();

    const clickEvt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        screenX: clientX + window.screenX,
        screenY: clientY + window.screenY,
        button: 0,
        buttons: 0
    });
    el.dispatchEvent(clickEvt);
}

function ncuFindTotalScoreInputs() {
    let candidateInputs = [];

    // 1. 通过直接类名或占位符属性匹配
    const directInputs = Array.from(document.querySelectorAll('input.scores, input[id^="txt_marking_"], input[placeholder*="满分"]'));
    const visibleDirect = directInputs.filter(inp => {
        const rect = inp.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !inp.closest('#ncu-ai-grading-panel');
    });
    if (visibleDirect.length > 0) {
        candidateInputs = visibleDirect;
    } else {
        // 2. 通过附近的“满分”标签文字匹配
        const allElements = Array.from(document.querySelectorAll('div, span, td, p, li, label'));
        const manfenElement = allElements.find(el => {
            if (el.children.length > 0) return false;
            const text = (el.innerText || el.textContent || "").trim();
            return text.includes('满分') && !el.closest('#ncu-ai-grading-panel');
        });

        if (manfenElement) {
            let parent = manfenElement.parentElement;
            for (let i = 0; i < 4 && parent; i++) {
                const inputs = Array.from(parent.querySelectorAll('input[type="text"], input[type="number"], input:not([type])'));
                const scoreInputs = inputs.filter(inp => {
                    const type = inp.getAttribute('type') || 'text';
                    return ['text', 'number', 'tel'].includes(type) && !inp.closest('#ncu-ai-grading-panel');
                });
                if (scoreInputs.length >= 1) {
                    candidateInputs = scoreInputs;
                    break;
                }
                parent = parent.parentElement;
            }
        }

        // 3. 兜底匹配：页面右侧区域的输入框
        if (candidateInputs.length === 0) {
            candidateInputs = Array.from(document.querySelectorAll('input')).filter(inp => {
                const rect = inp.getBoundingClientRect();
                const isRightSide = rect.left > window.innerWidth * 0.7;
                const type = inp.getAttribute('type') || 'text';
                return isRightSide && ['text', 'number', 'tel'].includes(type) && !inp.closest('#ncu-ai-grading-panel');
            });
        }
    }

    // 统一过滤：如果存在 placeholder 包含“满分”的输入框，仅使用此类输入框
    if (candidateInputs.length > 0) {
        const manfenPlaceholderInput = candidateInputs.find(inp => {
            const ph = (inp.getAttribute('placeholder') || '').trim();
            return ph.includes('满分');
        });
        if (manfenPlaceholderInput) {
            return [manfenPlaceholderInput];
        }
    }

    return candidateInputs;
}

function ncuSetTotalScore(score) {
    const inputs = ncuFindTotalScoreInputs();
    if (!inputs || inputs.length === 0) return false;

    const roundedScore = Math.round(score * 10) / 10;
    const scoreStr = String(roundedScore);
    const parts = scoreStr.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '0';

    if (inputs.length >= 2) {
        ncuFillInputValue(inputs[0], integerPart);
        ncuFillInputValue(inputs[1], decimalPart);
    } else {
        ncuFillInputValue(inputs[0], scoreStr);
    }
    return true;
}

function ncuFillInputValue(input, val) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
        nativeSetter.call(input, val);
    } else {
        input.value = val;
    }
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
}

function ncuSimulateClickOnCanvas(canvas, xPercent, yPercent) {
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + (rect.width * xPercent / 100);
    const clientY = rect.top + (rect.height * yPercent / 100);

    console.log(`[NCU Grading Debug] ncuSimulateClickOnCanvas: x%=${xPercent}, y%=${yPercent}, clientX=${clientX}, clientY=${clientY}, canvasRect=${JSON.stringify(rect)}`);

    // 派发全局 mouseup/pointerup，兜底强制释放任何遗留的拖拽状态机悬空状态
    if (typeof window.PointerEvent === 'function') {
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, clientX: clientX, clientY: clientY }));
    }
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: clientX, clientY: clientY }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: clientX, clientY: clientY }));

    // 收集所有可能需要接收鼠标事件的目标元素
    const targets = new Set();

    // 1. 通过绝对物理坐标寻找最上层的真实元素（完美解决FabricJS、透明画板遮挡等导致事件被吸收的问题）
    if (typeof document.elementFromPoint === 'function') {
        const topEl = document.elementFromPoint(clientX, clientY);
        if (topEl) {
            console.log(`[NCU Grading Debug] elementFromPoint at (${clientX}, ${clientY}) returned:`, topEl.tagName, `class="${topEl.className}"`, `id="${topEl.id}"`, topEl.outerHTML.substring(0, 150));
            targets.add(topEl);
            if (topEl.parentElement) {
                targets.add(topEl.parentElement);
                // 同时加入该物理坐标父节点下的其他 canvas 兄弟节点
                const siblingCanvases = topEl.parentElement.querySelectorAll('canvas');
                siblingCanvases.forEach(c => {
                    if (!c.closest('#ncu-ai-grading-panel')) {
                        targets.add(c);
                    }
                });
            }
        } else {
            console.warn(`[NCU Grading Debug] elementFromPoint at (${clientX}, ${clientY}) returned null!`);
        }
    }

    // 2. 兜底策略：回溯传参 canvas 的三层父级树结构
    targets.add(canvas);
    let p = canvas.parentElement;
    for (let i = 0; i < 3 && p; i++) {
        targets.add(p);
        const nestedCanvases = p.querySelectorAll('canvas');
        nestedCanvases.forEach(c => {
            if (!c.closest('#ncu-ai-grading-panel')) {
                targets.add(c);
            }
        });
        p = p.parentElement;
    }

    // 3. 全局搜索可能覆盖在当前试卷图上的任何可见 canvas 节点（解决定位不在同一 DOM 树分支下的问题）
    const allCanvases = document.querySelectorAll('canvas');
    allCanvases.forEach(c => {
        if (c.closest('#ncu-ai-grading-panel')) return;
        const cRect = c.getBoundingClientRect();
        // 碰撞检测：判断此 canvas 与试卷图片是否有重叠
        const overlaps = !(cRect.right < rect.left ||
            cRect.left > rect.right ||
            cRect.bottom < rect.top ||
            cRect.top > rect.bottom);
        if (overlaps && cRect.width > 0 && cRect.height > 0) {
            console.log(`[NCU Grading Debug] Found overlapping drawing canvas overlay in document:`, c.tagName, `class="${c.className}"`, `id="${c.id}"`, cRect);
            targets.add(c);
        }
    });

    console.log(`[NCU Grading Debug] Total target elements gathered for event dispatch: ${targets.size}`);

    // 支持 PointerEvent 和 MouseEvent 双重事件流投递，解决现代前端画板依赖 Pointer事件的问题
    const eventActions = ['down', 'move', 'up', 'click'];

    targets.forEach((target, idx) => {
        if (!target) return;

        // 根据各目标元素自身的 BoundingRect 精确计算相对偏移量，保证多重遮罩物理对位一致
        const targetRect = target.getBoundingClientRect();
        const offsetX = clientX - targetRect.left;
        const offsetY = clientY - targetRect.top;

        console.log(`  Target #${idx + 1}: <${target.tagName.toLowerCase()}> class="${target.className}" id="${target.id}" computed (offsetX=${offsetX}, offsetY=${offsetY})`);

        eventActions.forEach(action => {
            let button = 0;
            let buttons = 0;
            if (action === 'down') {
                button = 0;
                buttons = 1;
            } else if (action === 'move') {
                button = -1; // 移动时没有 button 改变
                buttons = 1;
            } else if (action === 'up') {
                button = 0;
                buttons = 0;
            }

            if (action === 'click') {
                const clickEvt = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: clientX,
                    clientY: clientY,
                    screenX: clientX + window.screenX,
                    screenY: clientY + window.screenY,
                    button: 0,
                    buttons: 0
                });
                Object.defineProperties(clickEvt, {
                    offsetX: { value: offsetX, writable: true, configurable: true },
                    offsetY: { value: offsetY, writable: true, configurable: true },
                    layerX: { value: offsetX, writable: true, configurable: true },
                    layerY: { value: offsetY, writable: true, configurable: true }
                });
                target.dispatchEvent(clickEvt);
                return;
            }

            // 投递 PointerEvent 事件
            const pointerType = 'pointer' + action;
            if (typeof window.PointerEvent === 'function') {
                const pevt = new PointerEvent(pointerType, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: clientX,
                    clientY: clientY,
                    screenX: clientX + window.screenX,
                    screenY: clientY + window.screenY,
                    pointerId: 1,
                    pointerType: 'mouse',
                    isPrimary: true,
                    pressure: action === 'up' ? 0 : 0.5,
                    button: button,
                    buttons: buttons
                });
                Object.defineProperties(pevt, {
                    offsetX: { value: offsetX, writable: true, configurable: true },
                    offsetY: { value: offsetY, writable: true, configurable: true },
                    layerX: { value: offsetX, writable: true, configurable: true },
                    layerY: { value: offsetY, writable: true, configurable: true }
                });
                target.dispatchEvent(pevt);
            }

            // 投递 MouseEvent 事件
            const mouseType = (action === 'down') ? 'mousedown' : ((action === 'up') ? 'mouseup' : 'mousemove');
            const mevt = new MouseEvent(mouseType, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: clientX,
                clientY: clientY,
                screenX: clientX + window.screenX,
                screenY: clientY + window.screenY,
                button: button === -1 ? 0 : button,
                buttons: buttons
            });
            Object.defineProperties(mevt, {
                offsetX: { value: offsetX, writable: true, configurable: true },
                offsetY: { value: offsetY, writable: true, configurable: true },
                layerX: { value: offsetX, writable: true, configurable: true },
                layerY: { value: offsetY, writable: true, configurable: true }
            });
            target.dispatchEvent(mevt);
        });
    });
}

async function ncuApplyMarkingSubQuestion(canvas, status, score, comment, x, y, id, allSubQuestions) {
    let statusSymbol = '✓';
    if (status === 'incorrect') statusSymbol = '✗';
    else if (status === 'partial') statusSymbol = '⍻';

    console.log(`[NCU Grading Debug] ncuApplyMarkingSubQuestion: status=${status} (${statusSymbol}), score=${score}, comment="${comment}", coordinate=(${x}, ${y})`);

    // 辅助函数：计算是否为主打分栏的输入框
    const isTotalScoreInput = (el) => {
        const ph = (el.getAttribute('placeholder') || '').trim();
        const id = el.id || '';
        const className = typeof el.className === 'string' ? el.className : '';
        return id.includes('txt_marking_') || className.includes('score') || className.includes('scores') || ph.includes('满分');
    };

    // 辅助函数：在 canvas 上自动折行绘制文本并返回最后一行的 Y 坐标
    const fillTextWithWrapping = (ctx, text, startX, startY, maxWidth, lineHeight) => {
        const chars = Array.from(text);
        let line = '';
        let currentY = startY;

        for (let i = 0; i < chars.length; i++) {
            const testLine = line + chars[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && line.length > 0) {
                ctx.fillText(line, startX, currentY);
                line = chars[i];
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        if (line.length > 0) {
            ctx.fillText(line, startX, currentY);
        }
        return currentY;
    };

    // 1. 优先尝试直接在画笔 Canvas (.canvas-sketcher) 上绘制
    // 切换到自由画笔工具，这会自动触发网页初始化并生成 .canvas-sketcher 元素
    await ncuSetToolInMainWorld('freemark');
    await new Promise(r => setTimeout(r, 350));

    const canvasSketcher = document.querySelector('.canvas-sketcher');
    if (canvasSketcher) {
        console.log(`[NCU Grading Debug] Canvas sketcher found! Writing emoji, comment and score directly to canvas.`);
        const ctx = canvasSketcher.getContext('2d');

        // 设置绘制的纯红色颜色
        ctx.fillStyle = "#ff0000"; // 使用正红色

        // 确定绘制的坐标，若靠右则平移以留出足够的书写宽度
        let drawX = canvasSketcher.width * x / 100;
        const drawY = canvasSketcher.height * y / 100;

        // 计算当前评语栏可达到的最右侧边界（默认是画布最右侧减去安全空隙 15px）
        let rightBoundaryX = canvasSketcher.width - 15;

        // 智能检测左右排布：
        let hasLeftOrRightNeighbor = false;
        if (allSubQuestions && Array.isArray(allSubQuestions)) {
            // 找出所有在当前小题右侧的小题 (横坐标大于当前小题 x + 5%，且纵坐标相差小于 35%)
            const rightQuestions = allSubQuestions.filter(q => q.id !== id && q.x > x + 5 && Math.abs(q.y - y) < 35);
            if (rightQuestions.length > 0) {
                const minRightXPercent = Math.min(...rightQuestions.map(q => q.x));
                const limitX = canvasSketcher.width * (minRightXPercent - 5) / 100;
                // 确保限制后依然有至少 150px 的绘制空间，否则不进行限制
                if (limitX - drawX >= 150) {
                    rightBoundaryX = limitX;
                    console.log(`[NCU Grading Debug] Sub-question ${id} has right neighbor(s). Restricting right boundary to ${rightBoundaryX}px`);
                }
                hasLeftOrRightNeighbor = true;
            }

            // 找出所有在当前小题左侧的小题 (横坐标小于当前小题 x - 5%，且纵坐标相差小于 35%)
            const leftQuestions = allSubQuestions.filter(q => q.id !== id && q.x < x - 5 && Math.abs(q.y - y) < 35);
            if (leftQuestions.length > 0) {
                hasLeftOrRightNeighbor = true;
            }
        }

        // 基于确定的最右边界，如果宽度小于最小期望宽度，强行将 drawX 向左平移
        // 左右排布时单栏最小预留 240px，上下排布预留 380px
        const minAvailableWidth = hasLeftOrRightNeighbor ? 240 : 380;
        if (rightBoundaryX - drawX < minAvailableWidth) {
            drawX = Math.max(80, rightBoundaryX - minAvailableWidth);
        }

        // 计算最终的 maxWidth
        const maxWidth = rightBoundaryX - drawX;
        console.log(`[NCU Grading Debug] subQuestionId=${id}, hasLeftOrRightNeighbor=${hasLeftOrRightNeighbor}, minAvailableWidth=${minAvailableWidth}, rightBoundaryX=${rightBoundaryX}, drawX=${drawX}, maxWidth=${maxWidth}`);

        // 绘制对错 emoji (字号大一号：44px bold，偏移量偏左 50px)
        ctx.font = "bold 44px 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.fillText(statusSymbol, drawX - 50, drawY + 12);

        // 绘制评语 (字号大一号：24px bold，支持自动折行)
        ctx.font = "bold 24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
        const commentLineHeight = 32;
        const nextY = fillTextWithWrapping(ctx, comment, drawX, drawY, maxWidth, commentLineHeight);

        // 绘制得分 (在评语正下方，y轴基于最后一行的位置 nextY 间距增大为 34px 以适应大字号)
        ctx.fillText(`得分: ${score}`, drawX, nextY + 34);
        console.log(`[NCU Grading Debug] Directly painted texts on canvas: "${statusSymbol}", "${comment}", "得分: ${score}"`);

        await new Promise(r => setTimeout(r, 200));

        // 切换回空工具，自动固化、保存并上传图片数据
        await ncuSetToolInMainWorld('empty');
        await new Promise(r => setTimeout(r, 200));
    } else {
        console.warn(`[NCU Grading Debug] Canvas sketcher not found! Falling back to standard DOM input elements.`);

        // Fallback Step 0: 盖章
        const stampToolType = status === 'incorrect' ? 'wrong' : (status === 'partial' ? 'half' : 'right');
        await ncuSetToolInMainWorld(stampToolType);
        await new Promise(r => setTimeout(r, 200));

        console.log(`[NCU Grading Debug] Simulating click for stamp at (${x}, ${y})`);
        ncuSimulateClickOnCanvas(canvas, x, y);
        await new Promise(r => setTimeout(r, 250));

        const triggerEnterKey = (el) => {
            if (!el) return;
            ['keydown', 'keypress', 'keyup'].forEach(type => {
                const event = new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: 'Enter',
                    code: 'Enter',
                    location: 0
                });
                Object.defineProperty(event, 'keyCode', { get: () => 13 });
                Object.defineProperty(event, 'which', { get: () => 13 });
                el.dispatchEvent(event);
            });
        };

        // Fallback Step 1: 放置小题评语输入框
        await ncuSetToolInMainWorld('edit');
        await new Promise(r => setTimeout(r, 200));

        const textX = Math.min(x + 5, 95);
        console.log(`[NCU Grading Debug] Simulating click for comment text input at (${textX}, ${y})`);
        ncuSimulateClickOnCanvas(canvas, textX, y);
        await new Promise(r => setTimeout(r, 350));

        const commentInput = ncuFindSpawnedInput();
        if (commentInput) {
            console.log(`[NCU Grading Debug] Spawned comment input found and targeted:`, commentInput.tagName, `class="${commentInput.className}"`, `id="${commentInput.id}"`);
            const proto = commentInput.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (nativeSetter) {
                nativeSetter.call(commentInput, comment);
            } else {
                commentInput.value = comment;
            }
            commentInput.dispatchEvent(new Event('focus', { bubbles: true }));
            commentInput.dispatchEvent(new Event('input', { bubbles: true }));
            commentInput.dispatchEvent(new Event('change', { bubbles: true }));
            triggerEnterKey(commentInput);

            await new Promise(r => setTimeout(r, 150));
            commentInput.dispatchEvent(new Event('blur', { bubbles: true }));
            commentInput.blur();
            console.log(`[NCU Grading Debug] Written comment text: "${comment}"`);
        } else {
            console.warn(`[NCU Grading Debug] Spawned comment input NOT found! Comment could not be written.`);
        }
        await new Promise(r => setTimeout(r, 200));

        // Fallback Step 2: 放置小题得分输入框 (在评语正下方)
        const blockerElements = [];
        const savedPointerEvents = new Map();

        const existingInputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])'));
        existingInputs.forEach(el => {
            if (el.closest('#ncu-ai-grading-panel')) return;
            if (isTotalScoreInput(el)) return;

            let curr = el;
            for (let i = 0; i < 4 && curr; i++) {
                if (curr.tagName === 'BODY' || curr.tagName === 'HTML') break;
                blockerElements.push(curr);
                curr = curr.parentElement;
            }
        });

        console.log(`[NCU Grading Debug] Disabling pointer-events on ${blockerElements.length} elements to avoid click interception.`);
        blockerElements.forEach(el => {
            savedPointerEvents.set(el, el.style.pointerEvents);
            el.style.setProperty('pointer-events', 'none', 'important');
        });

        try {
            await ncuSetToolInMainWorld('edit');
            await new Promise(r => setTimeout(r, 200));

            const scoreY = Math.min(y + 7, 95);
            const scoreVal = `得分: ${score}`;
            console.log(`[NCU Grading Debug] Simulating click for score text input at (${textX}, ${scoreY})`);
            ncuSimulateClickOnCanvas(canvas, textX, scoreY);
            await new Promise(r => setTimeout(r, 350));

            const scoreInput = ncuFindSpawnedInput();
            if (scoreInput) {
                console.log(`[NCU Grading Debug] Spawned score input found and targeted:`, scoreInput.tagName, `class="${scoreInput.className}"`, `id="${scoreInput.id}"`);
                const proto = scoreInput.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
                if (nativeSetter) {
                    nativeSetter.call(scoreInput, scoreVal);
                } else {
                    scoreInput.value = scoreVal;
                }
                scoreInput.dispatchEvent(new Event('focus', { bubbles: true }));
                scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
                scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
                triggerEnterKey(scoreInput);

                await new Promise(r => setTimeout(r, 150));
                scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
                scoreInput.blur();
                console.log(`[NCU Grading Debug] Written score text: "${scoreVal}"`);
            } else {
                console.warn(`[NCU Grading Debug] Spawned score input NOT found! Score could not be written.`);
            }
        } finally {
            console.log(`[NCU Grading Debug] Restoring pointer-events on ${blockerElements.length} elements.`);
            blockerElements.forEach(el => {
                const saved = savedPointerEvents.get(el);
                if (saved !== undefined) {
                    el.style.pointerEvents = saved;
                }
            });
        }
    }
}

function ncuDetectQuestionTitle() {
    const headerElements = Array.from(document.querySelectorAll('div, span, p, a, li, dd, select, option')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < 150 && rect.left < window.innerWidth * 0.4;
    });
    for (const el of headerElements) {
        const text = (el.innerText || el.textContent || "").trim();
        const match = text.match(/(第[一二三四五六七八九十]+题)/);
        if (match) return match[1];
    }
    return "第三题";
}

function ncuDetectCourseName() {
    const headerElements = Array.from(document.querySelectorAll('div, span, p, a, li, dd, h1, h2, h3, select, option')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < 150;
    });
    for (const el of headerElements) {
        const text = (el.innerText || el.textContent || "").trim();
        const matchBook = text.match(/《([^》]+)》/);
        if (matchBook) {
            return matchBook[1];
        }
    }
    for (const el of headerElements) {
        const text = (el.innerText || el.textContent || "").trim();
        if (text.includes('考试') || text.includes('阅卷') || text.includes('试卷')) {
            const cleanText = text
                .replace(/[\d\-学期学年期中期末阶段性模拟测验复习正规重考补考统一放假度]/g, '')
                .replace(/(期期|期末|期中|考试|阅卷|试卷|课程|评价|管理|中心|平台|系统)/g, '')
                .trim();
            if (cleanText.length >= 2 && cleanText.length <= 15) {
                return cleanText;
            }
        }
    }
    return "";
}

async function ncuGetCanvasBase64(canvas) {
    try {
        if (canvas.tagName === 'IMG') {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.naturalWidth || canvas.width;
            tempCanvas.height = canvas.naturalHeight || canvas.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
            return dataUrl.split(',')[1];
        } else {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvas, 0, 0);
            const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.9);
            return dataUrl.split(',')[1];
        }
    } catch (e) {
        console.warn("[NCU Grading] Canvas direct toDataURL failed (CORS/Tainted).", e);
        const src = canvas.getAttribute('src');
        if (src) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'FETCH_IMAGE_BASE64',
                    url: new URL(src, window.location.origin).href
                }, response => {
                    if (response && response.success) resolve(response.base64);
                    else resolve(null);
                });
            });
        }
        return null;
    }
}

async function ncuRunCanvasTest() {
    const canvas = ncuFindMainCanvas();
    if (!canvas) {
        alert("❌ 未找到学生作答画布或图片，无法进行测试！");
        return;
    }

    const testBtn = document.getElementById('ncu-test-canvas-btn');
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.innerText = "⏳ 正在测试...";
    }

    try {
        console.log("[NCU Grading Test] Starting canvas marking test...");

        // 1. 测试清空画布
        await ncuClearMarkingsInMainWorld();
        const cleared = ncuFindToolbarButton('清空');
        if (cleared) {
            console.log("[NCU Grading Test] Clicking clear button...");
            cleared.click();
            const eventTypes = ['mousedown', 'mouseup', 'click'];
            eventTypes.forEach(type => {
                cleared.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
            });
            await new Promise(r => setTimeout(r, 400));
        }

        // 2. 测试第一小题的标记与评语：✓ 标记，在 x=50%, y=30%
        console.log("[NCU Grading Test] Applying subquestion 1 (correct, score 5, x=50, y=30)...");
        await ncuApplyMarkingSubQuestion(canvas, 'correct', 5, '决策树逻辑完全正确，分支清晰规范。(测试批注)', 50, 30);
        await new Promise(r => setTimeout(r, 600));

        // 3. 测试第二小题的标记与评语：✗ 标记，在 x=50%, y=70%
        console.log("[NCU Grading Test] Applying subquestion 2 (incorrect, score 0, x=50, y=70)...");
        await ncuApplyMarkingSubQuestion(canvas, 'incorrect', 0, '决策表缺失，请核对标准规则数。(测试批注)', 50, 70);
        await new Promise(r => setTimeout(r, 600));

        // 4. 测试回填总分到总分输入框
        console.log("[NCU Grading Test] Filling total score 5...");
        const scoreFilled = ncuSetTotalScore(5);

        if (scoreFilled) {
            alert("✅ 测试完成！请检查画布上是否画出了 ✓/✗ 印章、输入了评语文本，且右侧得分栏填入了 5 分。");
        } else {
            alert("⚠️ 画布测试执行完成，但未能在页面右侧找到总分填分输入框，请手动核对画布批注。");
        }
    } catch (e) {
        console.error("Canvas test failed:", e);
        alert("❌ 测试运行发生错误: " + e.message);
    } finally {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.innerText = "🎨 测试画布批注";
        }
    }
}

async function ncuStartGrading() {
    const btn = document.getElementById('ncu-start-grade-btn');
    if (!btn) return;

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.style.background = '#909399';
    btn.innerText = '⏳ 正在定位答题卡...';

    try {
        const canvas = ncuFindMainCanvas();
        if (!canvas) {
            alert("❌ 未找到学生答卷画布，请确认页面加载完毕且试卷图片已显示。");
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #0072ff, #00c6ff)';
            btn.innerText = originalText;
            return;
        }

        btn.innerText = '⏳ 提取图片中...';
        const base64Image = await ncuGetCanvasBase64(canvas);
        if (!base64Image) {
            throw new Error("无法转换画布为 Base64 格式");
        }

        btn.innerText = '⏳ AI 正在阅卷...';

        const subQuestions = [];
        const items = document.querySelectorAll('.ncu-sub-item');
        items.forEach(item => {
            const id = item.dataset.id;
            const maxScoreInput = item.querySelector('.ncu-sub-max-score');
            const answerInput = item.querySelector('.ncu-sub-answer');
            if (maxScoreInput && answerInput) {
                subQuestions.push({
                    id: id,
                    maxScore: parseFloat(maxScoreInput.value) || 0,
                    answer: answerInput.value.trim()
                });
            }
        });

        if (subQuestions.length === 0) {
            alert("⚠️ 请至少配置一个要阅卷的小题！");
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #0072ff, #00c6ff)';
            btn.innerText = originalText;
            return;
        }

        let subQuestionsText = "";
        let totalMaxScore = 0;
        subQuestions.forEach(sq => {
            subQuestionsText += `第${sq.id}小题：分值${sq.maxScore}分。评分标准：${sq.answer || '无'}\n`;
            totalMaxScore += sq.maxScore;
        });

        const descInput = document.querySelector('#ncu-main-q-desc');
        const mainQuestionDesc = descInput ? descInput.value.trim() : "";
        const detectedCourse = ncuDetectCourseName();

        chrome.runtime.sendMessage({
            type: 'CALL_LLM_MARKING',
            payload: {
                base64Image: base64Image,
                questionTitle: currentQTitle || '阅卷题目',
                totalMaxScore: totalMaxScore,
                subQuestionsText: subQuestionsText,
                mainQuestionDesc: mainQuestionDesc,
                courseName: detectedCourse
            }
        }, async (response) => {
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #0072ff, #00c6ff)';
            btn.innerText = originalText;

            if (chrome.runtime.lastError || !response || !response.success) {
                console.error("❌ [AI Marking] Error:", chrome.runtime.lastError || response?.error);
                alert("智能阅卷失败: " + (response?.error || chrome.runtime.lastError?.message || "通信异常"));
                return;
            }

            console.log("✅ [AI Marking] Received grading response:", response.data);

            const results = response.data.subQuestions;
            if (!results || !Array.isArray(results)) {
                alert("❌ AI 返回数据格式错误，未包含小题评阅信息。");
                return;
            }

            // 弹出人工确认与微调对话框，教师修改确认后再触发画布绘图和分数写入
            ncuShowReviewDialog(results, subQuestions, canvas, async (editedResults) => {
                try {
                    // 1. 清空画布上已有的批注
                    await ncuClearMarkingsInMainWorld();
                    const cleared = ncuFindToolbarButton('清空');
                    if (cleared) {
                        cleared.click();
                        const eventTypes = ['mousedown', 'mouseup', 'click'];
                        eventTypes.forEach(type => {
                            cleared.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
                        });
                        await new Promise(r => setTimeout(r, 200));
                    }

                    // 2. 依次应用并手绘各小题结果到画布
                    let calculatedTotalScore = 0;
                    for (const result of editedResults) {
                        calculatedTotalScore += result.score;
                        await ncuApplyMarkingSubQuestion(canvas, result.status, result.score, result.comment, result.x, result.y, result.id, editedResults);
                        await new Promise(r => setTimeout(r, 300));
                    }

                    // 3. 填入计算后的总得分
                    console.log(`[NCU Grading] Final confirmed total score: ${calculatedTotalScore}`);
                    const scoreFilled = ncuSetTotalScore(calculatedTotalScore);
                    if (!scoreFilled) {
                        alert(`⚠️ 已完成图画批注，但未能在页面右侧找到打分框输入。请手动填入总得分: ${calculatedTotalScore} 分`);
                    }
                } catch (err) {
                    console.error("Error applying review modifications:", err);
                    alert("写入批阅修改时发生错误: " + err.message);
                }
            });
        });

    } catch (e) {
        console.error("Fatal error during NCU AI Grading:", e);
        alert("阅卷发生错误: " + e.message);
        btn.disabled = false;
        btn.style.background = 'linear-gradient(135deg, #0072ff, #00c6ff)';
        btn.innerText = originalText;
    }
}

function ncuInjectReviewDialogStyles() {
    if (document.getElementById('ncu-review-dialog-styles')) return;
    const style = document.createElement('style');
    style.id = 'ncu-review-dialog-styles';
    style.textContent = `
        .ncu-review-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(6px);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        }
        .ncu-review-modal {
            width: 550px;
            max-width: 90vw;
            max-height: 85vh;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.45);
            border-radius: 16px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: ncuFadeIn 0.3s ease;
        }
        @keyframes ncuFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
        .ncu-review-header {
            padding: 16px 20px;
            background: linear-gradient(135deg, #0072ff, #00c6ff);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 18px;
            font-weight: bold;
        }
        .ncu-review-close-btn {
            font-size: 24px;
            cursor: pointer;
            line-height: 1;
            color: rgba(255, 255, 255, 0.8);
            transition: color 0.2s;
            border: none;
            background: transparent;
            outline: none;
        }
        .ncu-review-close-btn:hover {
            color: #ffffff;
        }
        .ncu-review-body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        /* 美化滚动条 */
        .ncu-review-body::-webkit-scrollbar {
            width: 8px;
        }
        .ncu-review-body::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.05);
            border-radius: 4px;
        }
        .ncu-review-body::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.15);
            border-radius: 4px;
        }
        .ncu-review-body::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.25);
        }
        .ncu-review-card {
            background: rgba(255, 255, 255, 0.6);
            border: 1px solid rgba(0, 0, 0, 0.06);
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            transition: all 0.2s;
        }
        .ncu-review-card:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
            border-color: rgba(0, 114, 255, 0.2);
        }
        .ncu-review-card-title {
            font-size: 15px;
            font-weight: bold;
            color: #333333;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .ncu-review-row {
            display: flex;
            gap: 12px;
            align-items: center;
        }
        .ncu-review-input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;
        }
        .ncu-review-label {
            font-size: 12px;
            color: #666666;
            font-weight: 500;
        }
        .ncu-review-select {
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid rgba(0, 0, 0, 0.15);
            background: #ffffff;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }
        .ncu-review-select:focus {
            border-color: #0072ff;
        }
        .ncu-review-number-input {
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid rgba(0, 0, 0, 0.15);
            background: #ffffff;
            font-size: 13px;
            width: 70px;
            outline: none;
            transition: border-color 0.2s;
        }
        .ncu-review-number-input:focus {
            border-color: #0072ff;
        }
        .ncu-review-textarea {
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid rgba(0, 0, 0, 0.15);
            background: #ffffff;
            font-size: 13px;
            line-height: 1.4;
            height: 60px;
            resize: none;
            outline: none;
            transition: border-color 0.2s;
        }
        .ncu-review-textarea:focus {
            border-color: #0072ff;
        }
        .ncu-review-footer {
            padding: 16px 20px;
            border-top: 1px solid rgba(0, 0, 0, 0.06);
            background: rgba(245, 247, 250, 0.9);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        .ncu-review-btn {
            padding: 8px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            outline: none;
        }
        .ncu-review-btn-cancel {
            background: #ffffff;
            color: #606266;
            border: 1px solid rgba(0, 0, 0, 0.15);
        }
        .ncu-review-btn-cancel:hover {
            background: #f5f7fa;
            color: #303133;
        }
        .ncu-review-btn-confirm {
            background: linear-gradient(135deg, #0072ff, #00c6ff);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(0, 114, 255, 0.25);
        }
        .ncu-review-btn-confirm:hover {
            opacity: 0.9;
            box-shadow: 0 6px 16px rgba(0, 114, 255, 0.35);
        }
    `;
    document.head.appendChild(style);
}

function ncuShowReviewDialog(results, subQuestions, canvas, onConfirm) {
    ncuInjectReviewDialogStyles();

    // 移除已有的对话框，以防万一
    const existing = document.getElementById('ncu-review-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ncu-review-overlay';
    overlay.className = 'ncu-review-overlay';

    const modal = document.createElement('div');
    modal.className = 'ncu-review-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'ncu-review-header';
    header.innerHTML = `
        <span>🤖 AI 批阅结果确认与微调</span>
        <button class="ncu-review-close-btn">&times;</button>
    `;
    modal.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'ncu-review-body';

    // 每一个小题对应的 Card
    const cardsData = [];
    results.forEach(result => {
        const sqConfig = subQuestions.find(s => s.id === result.id);
        const maxScore = sqConfig ? sqConfig.maxScore : 5;
        let initialScore = parseFloat(result.score) || 0;
        if (initialScore > maxScore) initialScore = maxScore;
        if (initialScore < 0) initialScore = 0;

        const card = document.createElement('div');
        card.className = 'ncu-review-card';
        card.dataset.id = result.id;

        // Card HTML
        card.innerHTML = `
            <div class="ncu-review-card-title">
                <span>第 ${result.id} 小题 <span style="font-size: 12px; color: #999; font-weight: normal;">(分值: ${maxScore}分)</span></span>
                <span style="font-size: 11px; color: #888; font-weight: normal;">坐标: (${result.x || 0}, ${result.y || 0})</span>
            </div>
            <div class="ncu-review-row">
                <div class="ncu-review-input-group" style="flex: 0 0 120px;">
                    <span class="ncu-review-label">对错状态</span>
                    <select class="ncu-review-select ncu-card-status">
                        <option value="correct" ${result.status === 'correct' ? 'selected' : ''}>✓ 正确</option>
                        <option value="partial" ${result.status === 'partial' ? 'selected' : ''}>⍻ 半对</option>
                        <option value="incorrect" ${result.status === 'incorrect' ? 'selected' : ''}>✗ 错误</option>
                    </select>
                </div>
                <div class="ncu-review-input-group" style="flex: 0 0 100px;">
                    <span class="ncu-review-label">得分</span>
                    <input type="number" class="ncu-review-number-input ncu-card-score" 
                           value="${initialScore}" min="0" max="${maxScore}" step="0.5">
                </div>
            </div>
            <div class="ncu-review-input-group">
                <span class="ncu-review-label">批语</span>
                <textarea class="ncu-review-textarea ncu-card-comment" placeholder="输入该题批语...">${result.comment || ''}</textarea>
            </div>
        `;

        // 监听分数的限制逻辑
        const scoreInput = card.querySelector('.ncu-card-score');
        scoreInput.onchange = () => {
            let val = parseFloat(scoreInput.value) || 0;
            if (val > maxScore) val = maxScore;
            if (val < 0) val = 0;
            scoreInput.value = val;
        };

        body.appendChild(card);
        cardsData.push({
            id: result.id,
            x: result.x,
            y: result.y,
            cardEl: card
        });
    });

    modal.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'ncu-review-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ncu-review-btn ncu-review-btn-cancel';
    cancelBtn.innerText = '取消';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'ncu-review-btn ncu-review-btn-confirm';
    confirmBtn.innerText = '确认并写入';

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 事件绑定：关闭与取消
    const destroyModal = () => {
        overlay.remove();
    };

    header.querySelector('.ncu-review-close-btn').onclick = destroyModal;
    cancelBtn.onclick = destroyModal;

    // 点击确认
    confirmBtn.onclick = () => {
        const editedResults = [];
        cardsData.forEach(item => {
            const cardEl = item.cardEl;
            const statusVal = cardEl.querySelector('.ncu-card-status').value;
            const scoreVal = parseFloat(cardEl.querySelector('.ncu-card-score').value) || 0;
            const commentVal = cardEl.querySelector('.ncu-card-comment').value.trim();

            editedResults.push({
                id: item.id,
                status: statusVal,
                score: scoreVal,
                comment: commentVal,
                x: item.x,
                y: item.y
            });
        });

        destroyModal();
        if (onConfirm) {
            onConfirm(editedResults);
        }
    };
}


// =========================================================================
// PAGE ROUTING INITIALIZATION BLOCK FOR NCU GRADING
// =========================================================================
if (window.location.hostname.includes('ncu.edu.cn')) {
    if (window.location.pathname.includes('/personal/')) {
        ncuInit();
    }
}
console.log(`✅ [AI 批改扩展 - NCU阅卷模块] 内容脚本加载完毕 (${window.self === window.top ? 'Main Window' : 'IFrame'})`);
