// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 주의: 이 부분은 본인의 Firebase 프로젝트 설정값으로 채워넣어야 합니다.
// (Firebase 콘솔 -> 프로젝트 설정 -> 웹 앱 추가 시 나오는 코드입니다)
const firebaseConfig = {
  apiKey: "AIzaSyA3dEjF-0kS8Crb2WF8xWKZu2sHBMqhi5g",
  authDomain: "cafe-dunsan.firebaseapp.com",
  projectId: "cafe-dunsan",
  storageBucket: "cafe-dunsan.firebasestorage.app",
  messagingSenderId: "287558176713",
  appId: "1:287558176713:web:3f63455ba48c8286d9a218"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
