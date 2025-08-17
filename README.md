[繁體中文](README.md) | [English](README_EN.md)

# Clive Discord Bot

## 簡介
Clive 是一個多功能 Discord 機器人，基於 Node.js 和 `discord.js` 開發。它利用 Google Gemini API 來提供模仿人類的互動體驗，包括文字與圖片的理解與回應，並具備進階的互動系統。

## 功能亮點
- **智慧聊天**：透過 Google Gemini API 進行流暢、自然的文字對話。
- **圖片分析**：能夠理解並回應使用者傳送的圖片內容。
- **語音功能**：支援語音頻道的互動 (由 `voiceService.js` 提供支援)。
- **好感度系統**：獨特的 `favorabilitySystem.js`，機器人會根據互動情況對使用者產生不同的好感度，影響其回應方式。
- **記憶系統**：透過 `memorySystem.js` 記錄對話上下文，提供更連貫的聊天體驗。
- **主動訊息**：`proactiveSystem.js` 讓機器人能夠在特定條件下主動發起對話或做出反應。
- **管理指令**：內建管理員專用指令，方便維護與設定。

## 需求
- **Node.js**: v18.x 或更高版本
- **npm** (通常隨 Node.js 一起安裝)
- **Discord Bot Token**: 1個
- **Google Gemini API Key**: 1個

## 安裝與設定

### 1. 下載專案
您可以透過 git clone 或直接下載 ZIP 檔案來取得專案。
```bash
git clone https://your-repository-url.git
cd Clive
```

### 2. 安裝依賴
在專案的根目錄下，執行以下指令來安裝所有必要的套件：
```bash
npm install
```

### 3. 配置環境變數
在專案根目錄中，建立一個名為 `.env` 的檔案。這個檔案將用來存放您的機密金鑰。請參考以下格式填入您的資訊：

```env
# .env

# 您的 Discord 機器人 Token
BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"

# 您的 Google Gemini API Key
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# 機器人開發者/擁有者的 Discord ID
DEVELOPER_ID="YOUR_DISCORD_ID"

# (可選) 預設回應的頻道 ID
DEFAULT_CHANNEL_ID="YOUR_DEFAULT_CHANNEL_ID"
```

## 啟動機器人
完成設定後，在專案根目錄執行以下指令來啟動機器人：
```bash
node src/bot.js
```
如果一切順利，您應該會在控制台看到機器人成功登入的訊息，並且機器人會在您的 Discord 伺服器上線。

## 使用方法

### 一般互動
- **文字聊天**：在任何機器人有權限讀取的頻道中，直接提及 (mention) 機器人或與其對話，它就會回應。
- **圖片聊天**：傳送一張圖片，並可選擇性地附上文字，機器人會根據圖片內容進行回應。

### 管理指令
以下是預設的管理指令 (可能需要開發者權限)：
- `!reset`: 重置機器人的對話記憶，開始一個全新的對話。
- `!setchannel [頻道ID]`: 設定機器人只在特定頻道回應。
- `!unsetchannel`: 取消特定頻道的設定，讓機器人可以在所有授權頻道中回應。

## 專案結構
```
Clive/
├── src/
│   ├── bot.js                    # 機器人主程式進入點
│   ├── config.js                 # 專案設定檔
│   ├── commands/                 # 指令存放目錄
│   │   └── adminCommands.js
│   ├── handlers/                 # 事件處理器 (如訊息、反應)
│   │   ├── messageCreateHandler.js
│   │   ├── messageReactionAddHandler.js
│   │   └── readyHandler.js
│   ├── services/                 # 外部服務 (API 串接)
│   │   ├── geminiService.js
│   │   └── voiceService.js
│   └── systems/                  # 核心互動系統
│       ├── favorabilitySystem.js
│       ├── memorySystem.js
│       └── proactiveSystem.js
├── .env                          # 環境變數 (需自行建立)
├── package.json                  # 專案依賴與腳本
└── README.md                     # 就是你正在看的這個檔案
```

## 貢獻
如果您有任何功能建議或發現 Bug，歡迎提出 Issue 或發送 Pull Request。

## 許可
本專案採用 [MIT](LICENSE) 授權。
