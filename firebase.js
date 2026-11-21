// firebase.js — 로그인(학번 + 비밀번호)과 Firestore DB 연결을 한곳에 모은 공용 모듈
//
// 사용법 (각 페이지에서):
//   <script type="module">
//     import { requireLogin, listPosts } from "./firebase.js";
//     const user = await requireLogin();   // 로그인 안 했으면 index.html로 보냄
//     const posts = await listPosts();
//   </script>
//
// 모듈 문법을 쓰기 어려운 기존 스크립트에서는 window.RoommateDB 로도 같은 함수를 쓸 수 있음.
//   <script type="module" src="firebase.js"></script>
//   window.addEventListener("roommate-db-ready", () => { RoommateDB.listPosts().then(...) });
//
// 주의: type="module" 스크립트는 file:// 로 열면 동작하지 않음.
//       VS Code Live Server 같은 로컬 서버로 열거나 Firebase Hosting에 올려서 확인할 것.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- 1. Firebase 설정 ----------
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정 및 구성 에서 복사해 붙여넣기
const firebaseConfig = {
  apiKey: "AIzaSyABxWGqxwpz5YihlLWUPf9C8P2SEEQBC2o",
  authDomain: "matching-site-ecdc0.firebaseapp.com",
  projectId: "matching-site-ecdc0",
  storageBucket: "matching-site-ecdc0.firebasestorage.app",
  messagingSenderId: "926973616118",
  appId: "1:926973616118:web:70bc825b7f00aa18d671d7",
  measurementId: "G-CYJ1QEMHN7",
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
export let auth = null;
export let db = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  console.warn("[firebase.js] firebaseConfig가 비어 있습니다. Firebase 콘솔의 설정값을 붙여넣어 주세요.");
}

function ensureReady() {
  if (!isConfigured) throw new Error("Firebase 설정값이 없습니다. firebase.js의 firebaseConfig를 채워주세요.");
}

// ---------- 2. 로그인 (학번 + 비밀번호) ----------
// Firebase Auth는 이메일 형식 ID가 필요해서 학번을 내부용 이메일로 바꿔 사용함.
// 실제로 메일이 가지는 않음 → 비밀번호 찾기(메일 발송)는 지원하지 않음.
const STUDENT_EMAIL_DOMAIN = "students.roommate-match.example.com";
export const STUDENT_ID_PATTERN = /^\d{6,12}$/; // 학교 학번 형식에 맞게 조정

function studentEmail(studentId) {
  return `${String(studentId).trim()}@${STUDENT_EMAIL_DOMAIN}`;
}

export function validateStudentId(studentId) {
  return STUDENT_ID_PATTERN.test(String(studentId ?? "").trim());
}

const AUTH_ERRORS = {
  "auth/email-already-in-use": "이미 가입된 학번입니다.",
  "auth/invalid-email": "학번 형식이 올바르지 않습니다.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/invalid-credential": "학번 또는 비밀번호가 올바르지 않습니다.",
  "auth/wrong-password": "학번 또는 비밀번호가 올바르지 않습니다.",
  "auth/user-not-found": "학번 또는 비밀번호가 올바르지 않습니다.",
  "auth/too-many-requests": "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 연결을 확인해주세요.",
  "auth/operation-not-allowed": "Firebase 콘솔에서 이메일/비밀번호 로그인이 꺼져 있습니다.",
};

export function authErrorMessage(error) {
  return AUTH_ERRORS[error?.code] || error?.message || "알 수 없는 오류가 발생했습니다.";
}

/** 회원가입: users/{uid} 에 학번·이름 저장 */
export async function signUp(studentId, password, name) {
  ensureReady();
  studentId = String(studentId).trim();
  name = String(name ?? "").trim();
  if (!validateStudentId(studentId)) throw new Error("학번은 숫자만 입력해주세요.");
  if (!name) throw new Error("이름(닉네임)을 입력해주세요.");

  const cred = await createUserWithEmailAndPassword(auth, studentEmail(studentId), password);
  await setDoc(doc(db, "users", cred.user.uid), {
    studentId,
    name,
    admin: 0, // 관리자는 Firebase 콘솔에서 직접 1로 변경 (사이트에서는 변경 불가)
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

export async function signIn(studentId, password) {
  ensureReady();
  if (!validateStudentId(studentId)) throw new Error("학번은 숫자만 입력해주세요.");
  const cred = await signInWithEmailAndPassword(auth, studentEmail(studentId), password);
  return cred.user;
}

export function logOut() {
  ensureReady();
  return signOut(auth);
}

/** 로그인 상태가 바뀔 때마다 cb(user | null) 호출. 해제 함수 반환 */
export function onUserChanged(cb) {
  if (!isConfigured) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

/** 현재 로그인한 사용자 (첫 로딩 때 상태 확인이 끝날 때까지 기다림) */
export function currentUser() {
  if (!isConfigured) return Promise.resolve(null);
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => { stop(); resolve(user); });
  });
}

/** 로그인이 필요한 페이지에서 호출. 비로그인 시 index.html?next=현재주소 로 이동 */
export async function requireLogin() {
  const user = await currentUser();
  if (!user) {
    const next = location.pathname.split("/").pop() + location.search;
    location.href = `index.html?next=${encodeURIComponent(next)}`;
    return new Promise(() => {}); // 이동하는 동안 이후 코드 실행 막기
  }
  return user;
}

/** 내 프로필 { studentId, name } */
export async function getMyProfile() {
  ensureReady();
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data() : null;
}

/** 마이페이지 프로필 수정: { name?, intro? } (이름 20자, 자기소개 120자) */
export function updateMyProfile({ name, intro }) {
  const uid = requireUid();
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (intro !== undefined) data.intro = String(intro).trim();
  return updateDoc(doc(db, "users", uid), data);
}

function requireUid() {
  ensureReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return uid;
}

const withId = (snap) => ({ id: snap.id, ...snap.data() });

// ---------- 3. 게시판 (posts) — POSTS_INTEGRATION.md 구조 그대로 ----------

// 관리자가 숨긴 글은 게시판 목록에서 제외 (작성자 본인에게는 보임)
function visibleToMe(post) {
  return post.moderation?.hidden !== true || post.authorId === auth.currentUser?.uid;
}

export async function listPosts() {
  ensureReady();
  const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
  return snap.docs.map(withId).filter(visibleToMe);
}

/** 내가 쓴 글 (최신순). 복합 색인이 필요 없도록 정렬은 브라우저에서 함 */
export async function listMyPosts() {
  const uid = requireUid();
  const snap = await getDocs(query(collection(db, "posts"), where("authorId", "==", uid)));
  const time = (p) => p.createdAt?.toMillis?.() ?? Date.now();
  return snap.docs.map(withId).sort((a, b) => time(b) - time(a));
}

export function watchPosts(cb) {
  ensureReady();
  return onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")),
    (snap) => cb(snap.docs.map(withId).filter(visibleToMe)));
}

export async function getPost(postId) {
  ensureReady();
  const snap = await getDoc(doc(db, "posts", postId));
  return snap.exists() ? withId(snap) : null;
}

/** 게시글 하나 실시간 구독 (삭제되면 cb(null)) */
export function watchPost(postId, cb) {
  ensureReady();
  return onSnapshot(doc(db, "posts", postId), (snap) => cb(snap.exists() ? withId(snap) : null));
}

/** { title, body, dorm, typeCode? } → 새 게시글 ID 반환 */
export async function createPost({ title, body, dorm, typeCode = "" }) {
  const uid = requireUid();
  const profile = await getMyProfile();
  const ref = await addDoc(collection(db, "posts"), {
    authorId: uid,
    authorName: profile?.name || "익명",
    title, body, dorm, typeCode,
    status: "open",
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
  return ref.id;
}

/** 바꿀 필드만 전달: { title?, body?, dorm?, status?, typeCode? } */
export function updatePost(postId, changes) {
  requireUid();
  const allowed = ["title", "body", "dorm", "status", "typeCode"];
  const data = Object.fromEntries(Object.entries(changes).filter(([k]) => allowed.includes(k)));
  return updateDoc(doc(db, "posts", postId), { ...data, updatedAt: serverTimestamp() });
}

export function deletePost(postId) {
  requireUid();
  return deleteDoc(doc(db, "posts", postId));
}

// ---------- 4. 성향 검사 (surveys/{uid}) ----------

/** survey.html 의 state(answers, info 등)와 계산된 typeCode 저장. 추천 화면 표시용 이름도 같이 저장 */
export async function saveSurvey({ answers, info, typeCode = "" }) {
  const uid = requireUid();
  const profile = await getMyProfile();
  return setDoc(doc(db, "surveys", uid), {
    name: profile?.name || "익명",
    answers, info, typeCode,
    updatedAt: serverTimestamp(),
  });
}

export async function loadMySurvey() {
  const uid = requireUid();
  const snap = await getDoc(doc(db, "surveys", uid));
  return snap.exists() ? snap.data() : null;
}

/** 추천용: 다른 사용자들의 검사 결과 (dorm 지정 시 같은 생활관만) */
export async function listSurveys(dorm) {
  const uid = requireUid();
  const base = collection(db, "surveys");
  const q = dorm ? query(base, where("info.dorm", "==", dorm)) : base;
  const snap = await getDocs(q);
  return snap.docs.filter((d) => d.id !== uid).map((d) => ({ uid: d.id, ...d.data() }));
}

// ---------- 5. 채팅 (chats/{chatId}, chats/{chatId}/messages) ----------
// chatId = 두 사람 uid를 정렬해 이어 붙인 값 → 같은 두 사람은 항상 같은 채팅방

export function chatIdWith(otherUid) {
  const uid = requireUid();
  return [uid, otherUid].sort().join("_");
}

/**
 * 채팅방이 없으면 만들고 chatId 반환. 메시지는 자동 전송하지 않음
 * otherName: 상대 표시 이름 (게시글의 authorName, 설문의 name 등). 채팅방 doc의 names[uid]로 저장됨
 */
export async function openChat(otherUid, postId = null, otherName = "") {
  const uid = requireUid();
  if (otherUid === uid) throw new Error("자기 자신과는 채팅할 수 없습니다.");
  const chatId = chatIdWith(otherUid);
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const profile = await getMyProfile();
    await setDoc(ref, {
      members: [uid, otherUid].sort(),
      names: { [uid]: profile?.name || "익명", [otherUid]: otherName || "익명" },
      postId,
      status: "chatting", // chatting | requested | matched | ended
      requestedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return chatId;
}

export function watchChat(chatId, cb) {
  ensureReady();
  return onSnapshot(doc(db, "chats", chatId), (snap) => cb(snap.exists() ? withId(snap) : null));
}

export function setChatStatus(chatId, status) {
  const uid = requireUid();
  return updateDoc(doc(db, "chats", chatId), {
    status,
    requestedBy: status === "requested" ? uid : null,
    updatedAt: serverTimestamp(),
  });
}

/** text: 보낼 문장, type: chat.html에서 쓰는 메시지 종류(question/answer/system 등) */
export function sendMessage(chatId, text, type = "text") {
  const uid = requireUid();
  return addDoc(collection(db, "chats", chatId, "messages"), {
    senderId: uid, text, type,
    createdAt: serverTimestamp(),
  });
}

/** 메시지 실시간 구독: cb([{ id, senderId, text, type, createdAt, mine }]) */
export function watchMessages(chatId, cb) {
  ensureReady();
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const uid = auth.currentUser?.uid;
    cb(snap.docs.map((d) => ({ ...withId(d), mine: d.data().senderId === uid })));
  });
}

/** 내가 참여한 채팅방 목록 */
export async function listMyChats() {
  const uid = requireUid();
  const snap = await getDocs(query(collection(db, "chats"), where("members", "array-contains", uid)));
  return snap.docs.map(withId);
}

// ---------- 6. 관리자 (users/{uid}.admin == 1) ----------
// admin.html 의 adminPosts 객체와 같은 형태로 동작하도록 만든 함수들.
// 날짜는 admin.html 이 그대로 쓸 수 있게 ISO 문자열로 바꿔서 돌려줌.

const toIso = (ts) => ts?.toDate?.().toISOString() ?? null;

function adminPostView(snap) {
  const p = snap.data();
  return {
    id: snap.id,
    ...p,
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
    moderation: p.moderation ? { ...p.moderation, processedAt: toIso(p.moderation.processedAt) } : undefined,
  };
}

/**
 * 관리자 여부. 네트워크 오류 등은 false로 바꾸지 않고 그대로 던짐
 * → "관리자 아님"과 "확인 실패"를 호출한 쪽에서 구분할 수 있음
 */
export async function isAdmin() {
  const profile = await getMyProfile();
  return profile?.admin === 1;
}

/**
 * 관리자 페이지에서 호출. 비로그인 → 로그인 화면, 관리자 아님 → 메인으로 이동
 * 권한 확인 중 오류가 나면 예외를 던지므로 호출한 쪽에서 catch로 "다시 시도" 처리
 */
export async function requireAdmin() {
  const user = await requireLogin();
  if (!(await isAdmin())) {
    alert("관리자만 접근할 수 있는 페이지입니다.");
    location.replace("index.html");
    return new Promise(() => {});
  }
  return user;
}

/** 숨긴 글 포함 전체 글 (최신순) */
export async function adminListPosts() {
  ensureReady();
  const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
  return snap.docs.map(adminPostView);
}

/** 숨김·복구 처리 이력 (최신순): [{ postId, title, action, reason, processedAt, adminId }] */
export async function adminListHistory() {
  ensureReady();
  const snap = await getDocs(query(collection(db, "moderationLogs"), orderBy("processedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), processedAt: toIso(d.data().processedAt) }));
}

/** 모집 상태 변경. 그사이 다른 사람이 바꿨거나 숨김 상태면 false */
export function adminSetStatus(postId, expectedStatus, nextStatus) {
  requireUid();
  const ref = doc(db, "posts", postId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const p = snap.data();
    if (p.status !== expectedStatus || p.moderation?.hidden === true) return false;
    tx.update(ref, { status: nextStatus, updatedAt: serverTimestamp() });
    return true;
  });
}

/**
 * 글 숨기기(hidden=true) / 복구(hidden=false) + 처리 이력 저장을 한 번에 처리.
 * post: adminListPosts()로 받은 글. 그사이 다른 관리자가 먼저 처리했으면 false
 */
export function adminSetVisibility(post, hidden, reason) {
  const uid = requireUid();
  const ref = doc(db, "posts", post.id);
  const logRef = doc(collection(db, "moderationLogs"));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const current = snap.data();
    const sameState = (current.moderation?.hidden === true) === (post.moderation?.hidden === true)
      && toIso(current.moderation?.processedAt) === (post.moderation?.processedAt ?? null);
    if (!sameState) return false;

    tx.update(ref, {
      moderation: {
        hidden,
        hideReason: hidden ? reason : (current.moderation?.hideReason ?? null),
        restoreReason: hidden ? null : reason,
        processedAt: serverTimestamp(),
        processedBy: uid,
      },
    });
    tx.set(logRef, {
      postId: post.id,
      title: current.title || "(제목 없음)",
      action: hidden ? "hide" : "restore",
      reason,
      processedAt: serverTimestamp(),
      adminId: uid,
    });
    return true;
  });
}

// ---------- 7. 일반 스크립트용 전역 객체 ----------
window.RoommateDB = {
  isConfigured, validateStudentId, authErrorMessage,
  signUp, signIn, logOut, onUserChanged, currentUser, requireLogin, getMyProfile, updateMyProfile,
  listPosts, listMyPosts, watchPosts, getPost, watchPost, createPost, updatePost, deletePost,
  saveSurvey, loadMySurvey, listSurveys,
  chatIdWith, openChat, watchChat, setChatStatus, sendMessage, watchMessages, listMyChats,
  isAdmin, requireAdmin, adminListPosts, adminListHistory, adminSetStatus, adminSetVisibility,
};
window.dispatchEvent(new Event("roommate-db-ready"));
