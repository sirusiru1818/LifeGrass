/**
 * LifeGrass Admin Server (Port 3030)
 * 관리자 페이지 정적 파일 서빙
 * API는 메인 서버(3000)에서 처리하며, 프론트엔드에서 직접 호출
 */
require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3030;

app.use(express.static(path.join(__dirname, "admin")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.listen(PORT, () => {
  console.log(`LifeGrass Admin at http://localhost:${PORT}`);
  console.log(`Make sure the main server is running on port 3000 for API access.`);
});
