const express = require('express');
const path = require('path');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 設定靜態檔案路徑
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// 使用路由
app.use('/', routes);

// 啟動伺服器
app.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
});