const steps = [
    {
        question: "你看向酒櫃，要用什麼基酒來製作呢?",
        options: ["帶有杜松子味的基酒", "帶有甘蔗焦香的基酒"],
        key: "base"
    },
    {
        question: "要讓調酒有酸味嗎？",
        options: ["加檸檬汁", "不加檸檬汁"],
        key: "lemon"
    },
    {
        question: "要讓調酒有氣泡的口感嗎？",
        options: ["加蘇打水", "加通寧水", "不加"],
        key: "sparkle"
    },
    {
        question: "調酒要加入特別的風味嗎？",
        options: ["蜂蜜", "薄荷葉", "橙酒", "不加"],
        key: "flavor"
    },
    {
        question: "調酒要加裝飾物嗎？",
        options: ["加檸檬片(角)", "不加"],
        key: "garnish"
    },
    {
        question: "冰塊要怎麼處理？",
        options: ["做冰飲", "做冰沙"],
        key: "ice"
    }
];

let currentStep = 0;
let selections = {};
let showMixing = false;
let result = null;
let model = null;
let webcam = null;
let isPredicting = false;
let userId = null;
let recognitionResult = null;

// 提交資料到 Google 表單
async function submitToGoogleForm() {
    if (!userId) return;

    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSd_CrHBSjGD64DgThdFicrvaNsEiAA4LIhGsyF2XI6vTzgv4A/formResponse";
    const formData = new FormData();
    
    // 填入表單欄位資料
    formData.append("entry.2132530962", userId); // 使用者編號
    formData.append("entry.1990997538", selections.base || "無"); // 基酒
    formData.append("entry.16139639", selections.lemon || "無"); // 酸味
    formData.append("entry.2105822215", selections.sparkle || "無"); // 氣泡
    formData.append("entry.1291148248", selections.flavor || "無"); // 特別風味
    formData.append("entry.1589469551", selections.garnish || "無"); // 裝飾
    formData.append("entry.1876026105", selections.ice || "無"); // 冰塊
    formData.append("entry.1381809100", result ? result.stars : "無"); // 滿意度星級
    formData.append("entry.5840647", result ? result.name : "無"); // 調酒名稱
    formData.append("entry.1131561254", recognitionResult ? recognitionResult.cocktailName : "無"); // 辨識結果調酒名稱
    formData.append("entry.297429417", recognitionResult ? recognitionResult.probability.toFixed(2) : "無"); // 辨識準確度

    try {
        const response = await fetch(formUrl, {
            method: "POST",
            body: formData,
            mode: "no-cors" // 使用 no-cors 模式，因為 Google 表單不返回 CORS 頭
        });
        console.log("已成功提交資料到 Google 表單");
    } catch (error) {
        console.error("提交資料失敗:", error);
    }
}

// 顯示使用者編號輸入介面
function renderUserIdInput() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="container">
            <div class="card">
                <h1>請輸入您的使用者編號</h1>
                <input type="text" id="user-id-input" placeholder="例如: 001" />
                <button class="start-button" onclick="startGame()">開始</button>
            </div>
        </div>
    `;
}

function startGame() {
    const input = document.getElementById('user-id-input').value.trim();
    if (!input) {
        alert("請輸入使用者編號！");
        return;
    }
    userId = input;
    currentStep = 0;
    selections = {};
    render();
}

async function loadTeachableModel() {
    const URL = "teachable-machine-model/";
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    try {
        model = await tmImage.load(modelURL, metadataURL);
        console.log("Teachable Machine model loaded successfully");
        document.getElementById("teachable-result").innerText = "模型載入成功";
    } catch (error) {
        console.error("模型載入失敗:", error);
        document.getElementById("teachable-result").innerText = `無法載入模型：${error.message}。請確認模型檔案是否存在並使用本地伺服器運行。`;
    }
}

async function predictCocktail() {
    if (isPredicting && webcam) {
        await webcam.stop();
        webcam = null;
        isPredicting = false;
    }

    const webcamContainer = document.getElementById("webcam-container");
    const teachableMachineContainer = document.getElementById("teachable-machine-container");
    webcamContainer.innerHTML = "";
    const successMessage = document.getElementById("success-message");
    if (successMessage) {
        successMessage.remove();
    }

    let attempts = 0;
    while (typeof tmImage === 'undefined' && attempts < 5) {
        console.error("Teachable Machine 庫未載入，等待中...");
        document.getElementById("teachable-result").innerText = "Teachable Machine 庫未載入，等待中...";
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
    }

    if (typeof tmImage === 'undefined') {
        console.error("Teachable Machine 庫仍未載入，請檢查腳本路徑或網路");
        document.getElementById("teachable-result").innerText = "Teachable Machine 庫仍未載入，請檢查腳本路徑或網路";
        return;
    }

    try {
        webcam = new tmImage.Webcam(400, 400, true);
        await webcam.setup();
        await webcam.play();
        webcamContainer.appendChild(webcam.canvas);
        document.getElementById("teachable-result").innerText = "攝影機已啟動，正在辨識...";

        const confirmButton = document.createElement('button');
        confirmButton.className = 'teachable-button';
        confirmButton.innerText = '確認送上此調酒';
        confirmButton.onclick = () => {
            if (!webcam) return;

            webcam.stop();
            isPredicting = false;

            const resultText = document.getElementById("teachable-result").innerText;
            const match = resultText.match(/辨識結果: (.+) \((.+)%\)/);
            const cocktailName = match ? match[1] : "未知調酒";
            const probability = match ? parseFloat(match[2]) : 0;

            // 儲存辨識結果
            recognitionResult = {
                cocktailName: cocktailName,
                probability: probability
            };

            const snapshotData = webcam.canvas.toDataURL('image/png');
            webcamContainer.innerHTML = "";
            const snapshotImg = document.createElement('img');
            snapshotImg.id = 'snapshot';
            snapshotImg.src = snapshotData;
            webcamContainer.appendChild(snapshotImg);

            const successMessage = document.createElement('div');
            successMessage.id = 'success-message';
            successMessage.innerText = `你成功製作了顧客想要的調酒：${cocktailName}`;
            teachableMachineContainer.appendChild(successMessage);

            confirmButton.remove();

            // 重新提交資料（包含辨識結果）
            submitToGoogleForm();
        };
        teachableMachineContainer.appendChild(confirmButton);

        isPredicting = true;
        const loop = async () => {
            if (!isPredicting) return;

            webcam.update();
            const prediction = await model.predict(webcam.canvas);
            const maxPrediction = prediction.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);
            const probability = maxPrediction.probability * 100;
            document.getElementById("teachable-result").innerText = `辨識結果: ${maxPrediction.className} (${probability.toFixed(2)}%)`;

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    } catch (error) {
        console.error("攝影機錯誤詳情:", error);
        document.getElementById("teachable-result").innerText = `無法開啟攝影機：${error.message}。請確認攝影機權限並使用本地伺服器運行。`;
    }
}

function evaluateCocktail(selections) {
    if (selections.base === "帶有甘蔗焦香的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "加蘇打水" &&
        selections.flavor === "薄荷葉" &&
        selections.garnish === "加檸檬片(角)" &&
        selections.ice === "做冰飲") {
        return { stars: 3, name: "莫西多", image: "mojito-result.jpg", dialogue: "太完美了，這就是我想喝到的味道!" };
    }
    if (selections.base === "帶有杜松子味的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "加蘇打水" &&
        selections.flavor === "不加" &&
        selections.garnish === "加檸檬片(角)" &&
        selections.ice === "做冰飲") {
        return { stars: 2, name: "琴費士", image: "gin-fizz-result.jpg", dialogue: "好像還少了點清涼香氣.." };
    }
    if (selections.base === "帶有甘蔗焦香的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "加蘇打水" &&
        selections.flavor === "蜂蜜" &&
        selections.garnish === "不加" &&
        selections.ice === "做冰飲") {
        return { stars: 2, name: "Canchánchara", image: "canchanchara-result.jpg", dialogue: "這杯的味道似乎多了點蜂蜜味，但少了點清涼香氣。" };
    }
    if (selections.base === "帶有杜松子味的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "不加" &&
        selections.flavor === "薄荷葉" &&
        selections.garnish === "不加" &&
        selections.ice === "做冰飲") {
        return { stars: 2, name: "南方 Southside", image: "southside-result.jpg", dialogue: "喝起來酸酸的又有薄荷香氣，但好像少了氣泡感。" };
    }
    if (selections.base === "帶有杜松子味的基酒" &&
        selections.lemon === "不加檸檬汁" &&
        selections.sparkle === "加通寧水" &&
        selections.flavor === "不加" &&
        selections.garnish === "加檸檬片(角)" &&
        selections.ice === "做冰飲") {
        return { stars: 1, name: "琴通寧", image: "gin-tonic-result.jpg", dialogue: "氣泡的口感喝起來不錯，但味道不夠酸。" };
    }
    if (selections.base === "帶有甘蔗焦香的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "不加" &&
        selections.flavor === "不加" &&
        selections.garnish === "加檸檬片(角)" &&
        selections.ice === "做冰飲") {
        return { stars: 1, name: "黛綺莉", image: "daiquiri-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "帶有杜松子味的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "不加" &&
        selections.flavor === "蜂蜜" &&
        selections.garnish === "不加" &&
        selections.ice === "做冰飲") {
        return { stars: 1, name: "蜂之膝", image: "bees-knees-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "帶有杜松子味的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "不加" &&
        selections.flavor === "橙酒" &&
        selections.garnish === "不加" &&
        selections.ice === "做冰飲") {
        return { stars: 1, name: "白色佳人", image: "white-lady-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "帶有甘蔗焦香的基酒" &&
        selections.lemon === "加檸檬汁" &&
        selections.sparkle === "不加" &&
        selections.flavor === "不加" &&
        selections.garnish === "加檸檬片(角)" &&
        selections.ice === "做冰沙") {
        return { stars: 1, name: "霜凍黛綺莉", image: "frozen-daiquiri-result.jpg", dialogue: "做成冰沙沒辦法喝到氣泡感，而且也少了點清涼香氣。" };
    }
    return { stars: 0, name: "未知調酒", image: "angry-customer.jpg", dialogue: "因為你亂加材料，顧客憤怒的離開了！" };
}

function render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    if (!userId) {
        renderUserIdInput();
        return;
    }

    if (result) {
        const ingredients = `
            基酒: ${selections.base || "無"}<br>
            酸味: ${selections.lemon || "無"}<br>
            氣泡: ${selections.sparkle || "無"}<br>
            特別風味: ${selections.flavor || "無"}<br>
            裝飾: ${selections.garnish || "無"}<br>
            冰塊: ${selections.ice || "無"}
        `;
        const cocktailName = result.name === "未知調酒" ? "錯誤的調酒" : result.name;
        const satisfactionText = result.stars === 0 ? "顧客滿意度:😡😡😡" : `顧客滿意度: ${'⭐'.repeat(result.stars)}`;
        app.innerHTML = `
            <div class="container">
                <div class="card">
                    <p class="result-text ${result.stars === 0 ? 'angry' : ''}">
                        ${satisfactionText}<br>
                        你為顧客送上的調酒: ${cocktailName}<br>
                    </p>
                    <p class="ingredients-text">${ingredients}</p>
                    <img src="${result.image}" alt="${cocktailName}" class="result-image">
                    <p class="dialogue-text">"${result.dialogue}"</p>
                    <button class="restart-button" onclick="resetGame()">再做一杯</button>
                </div>
                <div class="teachable-machine-container" id="teachable-machine-container">
                    <button class="teachable-button" onclick="predictCocktail()">查看製作的調酒</button>
                    <div id="webcam-container"></div>
                    <div id="teachable-result" class="teachable-result"></div>
                </div>
            </div>
        `;
        loadTeachableModel();
        return;
    }

    const progressSvg = `
        <div class="cocktail-glass">
            <svg width="100" height="250" viewBox="0 0 100 250">
                <defs>
                    <linearGradient id="glass-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.3" />
                        <stop offset="50%" style="stop-color:#e0e0e0;stop-opacity:0.5" />
                        <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.3" />
                    </linearGradient>
                </defs>
                <path class="glass-outline" d="M10 50 L90 50 L50 140 Z" />
                <line class="stem" x1="50" y1="140" x2="50" y2="220" />
                <ellipse class="base" cx="50" cy="220" rx="30" ry="8" />
                <ellipse class="base-texture" cx="50" cy="220" rx="25" ry="6" />
                <polygon class="liquid-layer layer-1 ${currentStep >= 1 ? 'active' : ''}" points="50 136, 46 126, 54 126" />
                <polygon class="liquid-layer layer-2 ${currentStep >= 2 ? 'active' : ''}" points="50 126, 42 116, 58 116" />
                <polygon class="liquid-layer layer-3 ${currentStep >= 3 ? 'active' : ''}" points="50 116, 38 106, 62 106" />
                <polygon class="liquid-layer layer-4 ${currentStep >= 4 ? 'active' : ''}" points="50 106, 34 96, 66 96" />
                <polygon class="liquid-layer layer-5 ${currentStep >= 5 ? 'active' : ''}" points="50 96, 30 86, 70 86" />
                <polygon class="liquid-layer layer-6 ${currentStep >= 6 ? 'active' : ''}" points="50 86, 26 76, 74 76" />
                <g class="bottle-container ${currentStep >= 1 ? 'active' : ''}">
                    <image href="bottle.png" x="40" y="-50" width="60" height="120" />
                </g>
            </svg>
        </div>
    `;

    if (showMixing) {
        app.innerHTML = `
            <div class="container">
                <div class="card mixing">
                    <h1>調酒製作中...</h1>
                    <p>正在為您精心調製！</p>
                    <button class="serve-button" onclick="handleServe()">為顧客送上調酒</button>
                </div>
                ${progressSvg}
            </div>
        `;
        return;
    }

    const current = steps[currentStep];
    let optionsHtml = current.options.map(option => `
        <button class="option-button" onclick="handleSelection('${option}')">${option}</button>
    `).join('');

    app.innerHTML = `
        <div class="container">
            <div class="card">
                <h1>${current.question}</h1>
                ${optionsHtml}
            </div>
            ${progressSvg}
        </div>
    `;
}

function handleSelection(option) {
    selections[steps[currentStep].key] = option;
    if (currentStep < steps.length - 1) {
        currentStep++;
    } else {
        showMixing = true;
    }
    render();
}

function handleServe() {
    result = evaluateCocktail(selections);
    showMixing = false;
    render();
    // 自動提交資料（此時可能無辨識結果）
    submitToGoogleForm();
}

function resetGame() {
    currentStep = 0;
    selections = {};
    showMixing = false;
    result = null;
    recognitionResult = null;
    model = null;
    if (webcam) {
        webcam.stop();
        webcam = null;
    }
    isPredicting = false;
    userId = null;
    render();
}

document.addEventListener('DOMContentLoaded', () => {
    render();
});