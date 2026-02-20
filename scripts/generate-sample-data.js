/**
 * 랜덤 샘플 데이터 생성 스크립트
 * 여러 유저와 일기 데이터를 생성하여 Azure Blob Storage에 저장
 */
require("dotenv").config();
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "lifegrass";

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error("Error: AZURE_STORAGE_CONNECTION_STRING not set in .env");
  process.exit(1);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sanitizeUsername(username) {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 50);
}

async function getContainerClient() {
  const blobService = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
  const container = blobService.getContainerClient(AZURE_STORAGE_CONTAINER);
  await container.createIfNotExists();
  return container;
}

async function saveUserData(container, username, data, passwordHash) {
  const client = container.getBlockBlobClient(`users/${username}.json`);
  const payload = {
    passwordHash: passwordHash,
    birthYear: data.birthYear,
    filledWeeks: data.filledWeeks,
    journal: data.journal,
    updatedAt: new Date().toISOString(),
  };
  const content = JSON.stringify(payload, null, 2);
  await client.upload(Buffer.from(content, "utf8"), Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: "application/json" },
    overwrite: true,
  });
}

function getWeekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.min(Math.floor(diff / oneWeek), 51);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

const SAMPLE_KEYWORDS = [
  "work, coding, learning",
  "friends, dinner, fun",
  "study, reading, growth",
  "exercise, health, routine",
  "travel, adventure, memories",
  "family, home, comfort",
  "project, deadline, focus",
  "rest, relaxation, recharge",
  "meeting, networking, connections",
  "hobby, creativity, passion",
];

const SAMPLE_JOURNALS = [
  "This week was productive. Finished a major project and learned new skills. Feeling accomplished and ready for the next challenge.",
  "Spent quality time with friends over the weekend. Had great conversations and made new memories. Relationships are truly important.",
  "Focused on learning this week. Read two books and completed an online course. Knowledge is power.",
  "Started a new exercise routine. Feeling more energetic and motivated. Small steps lead to big changes.",
  "Traveled to a new city this week. Experienced different cultures and met interesting people. Travel broadens the mind.",
  "Family time was precious this week. Cooked together, shared stories, and felt grateful for these moments.",
  "Worked on an exciting project. Faced some challenges but overcame them. Growth comes from pushing boundaries.",
  "Took time to rest and recharge. Sometimes slowing down is the best way to move forward.",
  "Attended networking events and met inspiring people. Connections open new opportunities.",
  "Pursued my hobby this week. Creativity brings joy and balance to life.",
];

function generateRandomJournal() {
  const keywords = getRandomItem(SAMPLE_KEYWORDS);
  const text = getRandomItem(SAMPLE_JOURNALS);
  return { keywords, text };
}

function generateSampleUser(username, birthYear) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeek = getWeekOfYear(now);
  
  const filledWeeks = [];
  const journal = {};
  
  // 지난 1년간 랜덤하게 일기 작성 (약 20-30개)
  const weeksToFill = getRandomInt(20, 30);
  const startYear = currentYear - 1;
  const startWeek = currentWeek;
  
  for (let i = 0; i < weeksToFill; i++) {
    const yearOffset = getRandomInt(0, 1);
    const weekOffset = getRandomInt(0, 51);
    const year = startYear + yearOffset;
    const week = yearOffset === 0 && weekOffset > startWeek ? startWeek - getRandomInt(1, startWeek) : weekOffset;
    
    const key = `${year}-${week}`;
    if (!filledWeeks.includes(key)) {
      filledWeeks.push(key);
      journal[key] = generateRandomJournal();
    }
  }
  
  return {
    birthYear,
    filledWeeks: filledWeeks.sort(),
    journal,
  };
}

async function main() {
  console.log("Generating sample data...\n");
  
  const container = await getContainerClient();
  
  const sampleUsers = [
    { username: "alice", birthYear: 1995 },
    { username: "bob", birthYear: 1992 },
    { username: "charlie", birthYear: 1998 },
    { username: "diana", birthYear: 1990 },
    { username: "eve", birthYear: 1996 },
  ];
  
  for (const user of sampleUsers) {
    const safeUsername = sanitizeUsername(user.username);
    const passwordHash = hashPassword("password123"); // 모든 샘플 유저의 비밀번호는 "password123"
    
    const userData = generateSampleUser(safeUsername, user.birthYear);
    
    await saveUserData(container, safeUsername, userData, passwordHash);
    
    console.log(`✓ Created user: ${safeUsername}`);
    console.log(`  - Birth year: ${userData.birthYear}`);
    console.log(`  - Journaled weeks: ${userData.filledWeeks.length}`);
    console.log(`  - Password: password123`);
    console.log("");
  }
  
  console.log("Sample data generation complete!");
  console.log("\nYou can now:");
  console.log("- Login to http://localhost:3000/{username} with password 'password123'");
  console.log("- View all users at http://localhost:3030");
}

main().catch(console.error);
