document.addEventListener('DOMContentLoaded', () => {
  const apiProviderSelect = document.getElementById('api-provider');
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  const modelNameInput = document.getElementById('model-name');
  const courseNameInput = document.getElementById('course-name');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');

  const providerDefaults = {
    gemini: {
      apiUrl: "https://generativelanguage.googleapis.com",
      modelName: "gemini-3.1-flash-lite-preview"
    },
    openai: {
      apiUrl: "http://192.168.8.28:8000/v1/chat/completions",
      modelName: "Qwen/Qwen3.5-9B"
    },
    siliconflow: {
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      modelName: "Qwen/Qwen3.6-35B-A3B"
    },
    aliyun: {
      apiUrl: "https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
      modelName: "qwen3.7-plus"
    }
  };

  apiProviderSelect.addEventListener('change', (e) => {
    const defaults = providerDefaults[e.target.value];
    apiUrlInput.value = defaults.apiUrl;
    apiUrlInput.placeholder = defaults.apiUrl;
    modelNameInput.value = defaults.modelName;
    modelNameInput.placeholder = defaults.modelName;
    if (e.target.value === 'siliconflow') {
      apiKeyInput.placeholder = "填写您的硅基流动 sk-... 密钥";
    } else if (e.target.value === 'gemini') {
      apiKeyInput.placeholder = "填写您的 Gemini API Key";
    } else if (e.target.value === 'aliyun') {
      apiKeyInput.placeholder = "填写您的 DASHSCOPE_API_KEY";
    } else {
      apiKeyInput.placeholder = "vllm-local";
    }
  });

  // Load saved config
  chrome.storage.local.get(['apiProvider', 'apiUrl', 'apiKey', 'modelName', 'courseName'], (data) => {
    apiProviderSelect.value = data.apiProvider || "openai";
    apiUrlInput.value = data.apiUrl || "http://192.168.8.28:8000/v1/chat/completions";
    apiKeyInput.value = data.apiKey !== undefined ? data.apiKey : (apiProviderSelect.value === "openai" ? "vllm-local" : "");
    modelNameInput.value = data.modelName || "Qwen/Qwen3.5-9B";
    if (data.courseName) courseNameInput.value = data.courseName;
    
    const defaults = providerDefaults[apiProviderSelect.value];
    apiUrlInput.placeholder = defaults.apiUrl;
    modelNameInput.placeholder = defaults.modelName;
    if (apiProviderSelect.value === 'siliconflow') {
      apiKeyInput.placeholder = "填写您的硅基流动 sk-... 密钥";
    } else if (apiProviderSelect.value === 'gemini') {
      apiKeyInput.placeholder = "填写您的 Gemini API Key";
    } else if (apiProviderSelect.value === 'aliyun') {
      apiKeyInput.placeholder = "填写您的 DASHSCOPE_API_KEY";
    } else {
      apiKeyInput.placeholder = "vllm-local";
    }
  });

  // Save config
  saveBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      apiProvider: apiProviderSelect.value,
      apiUrl: apiUrlInput.value,
      apiKey: apiKeyInput.value,
      modelName: modelNameInput.value,
      courseName: courseNameInput.value
    }, () => {
      statusEl.textContent = 'Saved!';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 2000);
    });
  });
});
