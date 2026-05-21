import React from 'react';

// 검은 바탕에 흰 글씨 테마
export const colors = {
  bg: '#000000',       // 완전 검은색 배경
  surface: '#111111',  // 박스 배경 (아주 어두운 회색)
  primary: '#BB86FC',  // 포인트 색상 (연보라)
  secondary: '#03DAC6',
  text: '#FFFFFF',     // 기본 글씨 흰색
  textDim: '#CCCCCC',  // 약간 흐린 흰색
  border: '#333333',   // 테두리 선 색상
  danger: '#CF6679',
  success: '#4CAF50'
};

export const getTodayStr = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 타이틀 변경
export const Logo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <h1 style={{ color: colors.text, margin: 0, fontSize: '28px', fontWeight: 'bold' }}>
      그대, 요한을 만나다
    </h1>
  </div>
);
