const steps = [
    { key: "base", options: [{ name: "琴酒", id: "base1", key: "base" }, { name: "蘭姆酒", id: "base2", key: "base" }] },
    { key: "lemon", options: [{ name: "檸檬汁", id: "lemon-juice", key: "lemon" }] },
    { key: "sparkle", options: [{ name: "蘇打水", id: "soda-water", key: "sparkle" }, { name: "通寧水", id: "tonic-water", key: "sparkle" }] },
    { key: "flavor", options: [{ name: "蜂蜜", id: "honey", key: "flavor" }, { name: "薄荷葉", id: "mint", key: "flavor" }, { name: "橙酒", id: "orange-liqueur", key: "flavor" }] },
    { key: "garnish", options: [{ name: "檸檬片", id: "lemon-slice", key: "garnish" }] },
    { key: "ice", options: [{ name: "冰飲", id: "ice-drink", key: "ice" }, { name: "冰沙", id: "ice-blended", key: "ice" }] }
];

let currentStep = 0;
let selections = {};
let result = null;
let model = null;
let webcam = null;
let isPredicting = false;
let userId = null;
let recognitionResult = null;

// 粒子效果
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function initCanvas() {
    if (!canvas) {
        console.error("Particle canvas not found!");
        return;
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 5 + 2;
        this.speedX = Math.random() * 3 - 1.5;
        this.speedY = Math.random() * 3 - 1.5;
        this.life = 1;
        this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= 0.02;
        this.size *= 0.98;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createParticles(x, y) {
    for (let i = 0; i < 20; i++) {
        particles.push(new Particle(x, y));
    }
}

function animateParticles() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.update();
        p.draw();
    });
    requestAnimationFrame(animateParticles);
}

async function submitToGoogleForm() {
    if (!userId) {
        console.error("未提供使用者編號");
        return;
    }

    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSd_CrHBSjGD64DgThdFicrvaNsEiAA4LIhGsyF2XI6vTzgv4A/formResponse";
    const formData = new FormData();
    
    formData.append("entry.2132530962", userId);
    formData.append("entry.1990997538", selections.base || "無");
    formData.append("entry.16139639", selections.lemon || "無");
    formData.append("entry.2105822215", selections.sparkle || "無");
    formData.append("entry.1291148248", selections.flavor || "無");
    formData.append("entry.1589469551", selections.garnish || "無");
    formData.append("entry.1876026105", selections.ice || "無");
    formData.append("entry.1381809100", result ? result.stars : "無");
    formData.append("entry.5840647", result ? result.name : "無");
    formData.append("entry.1131561254", recognitionResult ? recognitionResult.cocktailName : "無");
    formData.append("entry.297429417", recognitionResult ? recognitionResult.probability.toFixed(2) : "無");

    try {
        await fetch(formUrl, {
            method: "POST",
            body: formData,
            mode: "no-cors"
        });
        console.log("表單提交成功");
    } catch (error) {
        console.error("表單提交失敗:", error);
    }
}

function renderUserIdInput() {
    const app = document.getElementById('app');
    if (!app) {
        console.error("App element not found!");
        return;
    }
    app.innerHTML = `
        <div class="container">
            <div class="card">
                <h1>歡迎來到微醺研究所</h1>
                <div class="user-id-input-container">
                    <input type="text" id="user-id-input" placeholder="例如: 001" />
                    <button class="start-button" onclick="startGame()">開始</button>
                </div>
            </div>
        </div>
    `;
}

function startGame() {
    const inputElement = document.getElementById('user-id-input');
    if (!inputElement) {
        console.error("User ID input element not found!");
        return;
    }
    const input = inputElement.value.trim();
    if (!input) {
        alert("請輸入使用者編號！");
        return;
    }
    userId = input;
    currentStep = 0;
    selections = {};
    console.log("Starting game with userId:", userId);
    render();
}

async function loadTeachableModel() {
    const URL = "./teachable-machine-model/";
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
        console.error("攝影機錯誤:", error);
        document.getElementById("teachable-result").innerText = `無法開啟攝影機：${error.message}。請確認攝影機權限並使用 HTTPS。`;
    }
}

function evaluateCocktail(selections) {
    if (selections.base === "蘭姆酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === "蘇打水" &&
        selections.flavor === "薄荷葉" &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 3, name: "莫西多", image: "./mojito-result.jpg", dialogue: "太完美了，這就是我想喝到的味道!" };
    }
    if (selections.base === "琴酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === "蘇打水" &&
        selections.flavor === undefined &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 2, name: "琴費士", image: "./kGin-fizz-result.jpg", dialogue: "好像還少了點清涼香氣.." };
    }
    if (selections.base === "蘭姆酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === "蘇打水" &&
        selections.flavor === "蜂蜜" &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 2, name: "Canchánchara", image: "./canchanchara-result.jpg", dialogue: "這杯的味道似乎多了點蜂蜜味，但少了點清涼香氣。" };
    }
    if (selections.base === "琴酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === undefined &&
        selections.flavor === "薄荷葉" &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 2, name: "南方 Southside", image: "./southside-result.jpg", dialogue: "喝起來酸酸的又有薄荷香氣，但好像少了氣泡感。" };
    }
    if (selections.base === "琴酒" &&
        selections.lemon === undefined &&
        selections.sparkle === "通寧水" &&
        selections.flavor === undefined &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 1, name: "琴通寧", image: "./gin-tonic-result.jpg", dialogue: "氣泡的口感喝起來不錯，但味道不夠酸。" };
    }
    if (selections.base === "蘭姆酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === undefined &&
        selections.flavor === undefined &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 1, name: "黛綺莉", image: "./daiquiri-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "琴酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === undefined &&
        selections.flavor === "蜂蜜" &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 1, name: "蜂之膝", image: "./bees-knees-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "琴酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === undefined &&
        selections.flavor === "橙酒" &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰飲") {
        return { stars: 1, name: "白色佳人", image: "./white-lady-result.jpg", dialogue: "這杯的味道似乎少了點清涼香氣，而且喝起來沒有氣泡口感" };
    }
    if (selections.base === "蘭姆酒" &&
        selections.lemon === "檸檬汁" &&
        selections.sparkle === undefined &&
        selections.flavor === undefined &&
        selections.garnish === "檸檬片" &&
        selections.ice === "冰沙") {
        return { stars: 1, name: "霜凍黛綺莉", image: "./frozen-daiquiri-result.jpg", dialogue: "做成冰沙沒辦法喝到氣泡感，而且也少了點清涼香氣。" };
    }
    return { stars: 0, name: "未知調酒", image: "./angry-customer.jpg", dialogue: "因為你亂加材料，顧客憤怒的離開了！" };
}

function render() {
    const app = document.getElementById('app');
    if (!app) {
        console.error("App element not found!");
        return;
    }
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
            <div class="container result-container">
                <div class="card">
                    <p class="result-text ${result.stars === 0 ? 'angry' : ''}">
                        ${satisfactionText}<br>
                        你為顧客送上的調酒: ${cocktailName}
                    </p>
                    <p class="ingredients-text">${ingredients}</p>
                    <img src="${result.image}" alt="${cocktailName}" class="result-image">
                    <p class="dialogue-text">"${result.dialogue}"</p>
                    <button class="restart-button" onclick="resetGame()">再做一杯</button>
                    <div class="teachable-machine-container" id="teachable-machine-container">
                        <button class="teachable-button" onclick="predictCocktail()">查看製作的調酒</button>
                        <div id="webcam-container"></div>
                        <div id="teachable-result" class="teachable-result"></div>
                    </div>
                </div>
            </div>
        `;
        loadTeachableModel();
        return;
    }

    app.innerHTML = `
        <div class="container">
            <div class="card">
                <h1>歡迎來到微醺研究所</h1>
                <p>你可以任意將材料加入酒杯製作調酒，請將材料拖曳至酒杯，但要注意材料加入的順序，一旦加錯了，就只能把酒杯的材料倒入水槽中重新製作。如果你完成調酒，請將酒杯拖曳至顧客區，為顧客送上調酒。</p>
            </div>
            <div class="bar-counter">
                <div class="cabinet">
                    <div class="cabinet-section" data-section="flavor">${steps[3].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                    <div class="cabinet-section" data-section="base">${steps[0].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                    <div class="cabinet-section" data-section="lemon">${steps[1].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                    <div class="cabinet-section" data-section="sparkle">${steps[2].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                    <div class="cabinet-section" data-section="ice">${steps[5].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                    <div class="cabinet-section" data-section="garnish">${steps[4].options.map(o => `<div class="ingredient ${o.id}" id="${o.id}" draggable="true" data-name="${o.name}" data-key="${o.key}"><span class="ingredient-label">${o.name}</span></div>`).join('')}</div>
                </div>
                <div class="counter-area">
                    <div class="glass-area" id="glass-area">
                        <div id="glass" draggable="true">
                            <div class="liquid-layer layer-1 ${selections.base ? 'active' : ''}"></div>
                            <div class="liquid-layer layer-2 ${selections.lemon ? 'active' : ''}"></div>
                            <div class="liquid-layer layer-3 ${selections.sparkle ? 'active' : ''}"></div>
                            <div class="liquid-layer layer-4 ${selections.flavor ? 'active' : ''}"></div>
                            <div class="liquid-layer layer-5 ${selections.garnish ? 'active' : ''}"></div>
                            <div class="liquid-layer layer-6 ${selections.ice ? 'active' : ''}"></div>
                        </div>
                    </div>
                    <div class="sink-area" id="sink-area">
                        <div id="sink"></div>
                    </div>
                </div>
                <div class="customer-area" id="customer-area">
                    <div id="customer-seat"></div>
                </div>
            </div>
            <div class="feedback-message" id="feedback-message"></div>
        </div>
    `;

    // 添加拖曳事件監聽器
    const ingredients = document.querySelectorAll('.ingredient');
    ingredients.forEach(ingredient => {
        ingredient.addEventListener('dragstart', handleDragStart);
        ingredient.addEventListener('dragend', handleDragEnd);
    });

    const glass = document.getElementById('glass');
    if (glass) {
        glass.addEventListener('dragstart', handleGlassDragStart);
        glass.addEventListener('dragend', handleGlassDragEnd);
    }

    const glassArea = document.getElementById('glass-area');
    if (glassArea) {
        glassArea.addEventListener('dragover', handleDragOver);
        glassArea.addEventListener('drop', handleDrop);
    }

    const sinkArea = document.getElementById('sink-area');
    if (sinkArea) {
        sinkArea.addEventListener('dragover', handleSinkDragOver);
        sinkArea.addEventListener('drop', handleSinkDrop);
    }

    const customerArea = document.getElementById('customer-area');
    if (customerArea) {
        customerArea.addEventListener('dragover', handleCustomerDragOver);
        customerArea.addEventListener('drop', handleCustomerDrop);
    }
}

function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.id);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleGlassDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', 'glass');
}

function handleGlassDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text');
    if (id === 'glass') return;

    const draggedElement = document.getElementById(id);
    const name = draggedElement.dataset.name;
    const key = draggedElement.dataset.key;
    const stepIndex = steps.findIndex(step => step.key === key);

    const feedbackMessage = document.getElementById('feedback-message');

    if (stepIndex >= currentStep) {
        selections[key] = name;
        feedbackMessage.textContent = `成功加入${name}！`;
        feedbackMessage.classList.add('show');
        setTimeout(() => feedbackMessage.classList.remove('show'), 2000);

        const rect = draggedElement.getBoundingClientRect();
        createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);

        draggedElement.style.opacity = '0';
        draggedElement.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
            draggedElement.style.display = 'none';
        }, 500);

        const layers = document.querySelectorAll('.liquid-layer');
        const activeLayers = Array.from(layers).filter(layer => layer.classList.contains('active'));
        layers.forEach((layer, index) => {
            if (index === stepIndex && !layer.classList.contains('active')) {
                layer.classList.add('active');
                layer.style.bottom = `${50 * activeLayers.length}px`;
            }
        });

        currentStep = Math.max(currentStep, stepIndex + 1);
    } else {
        feedbackMessage.textContent = `無法加入${name}，請勿跳回前一步驟！`;
        feedbackMessage.classList.add('show');
        setTimeout(() => feedbackMessage.classList.remove('show'), 2000);
    }
}

function handleSinkDragOver(e) {
    e.preventDefault();
}

function handleSinkDrop(e) {
    e.preventDefault();
    const glass = document.getElementById('glass');
    if (e.dataTransfer.getData('text') !== 'glass') return;

    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'confirm-dialog';
    confirmDialog.innerHTML = `
        <p>你是否要重新製作調酒？</p>
        <button onclick="confirmReset(true)">確認</button>
        <button onclick="confirmReset(false)">取消</button>
    `;
    document.getElementById('app').appendChild(confirmDialog);

    window.confirmReset = function(confirm) {
        if (confirm) {
            const sinkAnimation = document.createElement('div');
            sinkAnimation.className = 'sink-animation';
            glass.appendChild(sinkAnimation);
            setTimeout(() => {
                sinkAnimation.remove();
                selections = {};
                currentStep = 0;
                const layers = document.querySelectorAll('.liquid-layer');
                layers.forEach(layer => layer.classList.remove('active'));
                render();
            }, 1000);
        }
        confirmDialog.remove();
    };
}

function handleCustomerDragOver(e) {
    e.preventDefault();
}

function handleCustomerDrop(e) {
    e.preventDefault();
    const glass = document.getElementById('glass');
    if (e.dataTransfer.getData('text') !== 'glass') return;

    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'confirm-dialog';
    confirmDialog.innerHTML = `
        <p>你是否要為顧客送上這杯調酒？</p>
        <button onclick="confirmServe(true)">確認</button>
        <button onclick="confirmServe(false)">取消</button>
    `;
    document.getElementById('app').appendChild(confirmDialog);

    window.confirmServe = function(confirm) {
        if (confirm) {
            const overlay = document.createElement('div');
            overlay.className = 'transition-overlay';
            const glassAnimation = document.createElement('div');
            glassAnimation.className = 'glass-animation';
            overlay.appendChild(glassAnimation);
            const servingText = document.createElement('div');
            servingText.className = 'serving-text';
            servingText.innerText = "你正為顧客送上調酒";
            overlay.appendChild(servingText);
            document.body.appendChild(overlay);

            setTimeout(() => {
                overlay.remove();
                result = evaluateCocktail(selections);
                render();
                submitToGoogleForm();
            }, 3000);
        }
        confirmDialog.remove();
    };
}

function resetGame() {
    currentStep = 0;
    selections = {};
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
    try {
        initCanvas();
        animateParticles();
        render();
    } catch (error) {
        console.error("初始化失敗:", error);
    }
});