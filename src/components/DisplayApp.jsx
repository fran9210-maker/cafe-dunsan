import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';

const colors = {
  accent: '#FACC15',
  background: '#000000',
  card: '#1F2937',
  muted: '#9CA3AF',
  error: '#F87171',
};

const READY_STATUSES = [
  'ready',
  'completed',
  'done',
  '제조완료',
  '픽업대기',
];

function getPhoneLastDigits(order) {
  const phoneValue =
    order?.phone ||
    order?.phoneNumber ||
    order?.customerPhone ||
    order?.tel ||
    order?.mobile ||
    '';

  const digitsOnly = String(phoneValue).replace(/\D/g, '');

  if (!digitsOnly) {
    return '';
  }

  return digitsOnly.slice(-4);
}

export default function DisplayApp() {
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const ordersQuery = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({
          firestoreId: doc.id,
          ...doc.data(),
        }));

        const completed = orders
          .filter((order) => READY_STATUSES.includes(order.status))
          .slice(0, 20);

        setCompletedOrders(completed);
        setLoading(false);
        setErrorMessage('');
      },
      (error) => {
        console.error('Display orders load error:', error);
        setErrorMessage(error.message || '주문을 불러오지 못했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div
      style={{
        backgroundColor: colors.background,
        height: '100vh',
        color: '#FFFFFF',
        padding: '24px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h1
        style={{
          textAlign: 'center',
          fontSize: '46px',
          lineHeight: '1',
          color: colors.accent,
          margin: '0 0 24px 0',
          fontWeight: '900',
        }}
      >
        픽업 대기
      </h1>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '34px',
            color: '#FFFFFF',
          }}
        >
          로딩중...
        </div>
      ) : errorMessage ? (
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '26px',
            color: colors.error,
            lineHeight: '1.5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <div>주문을 불러오지 못했습니다.</div>
          <div>{errorMessage}</div>
        </div>
      ) : completedOrders.length === 0 ? (
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '34px',
            color: colors.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          픽업 대기 중인 주문이 없습니다
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(5, 1fr)',
            gap: '16px',
            minHeight: 0,
          }}
        >
          {completedOrders.map((order, index) => {
            const phoneLastDigits = getPhoneLastDigits(order);

            const displayNumber = phoneLastDigits || `없음${index + 1}`;

            return (
              <div
                key={order?.firestoreId || order?.id || index}
                style={{
                  backgroundColor: colors.card,
                  border: `5px solid ${colors.accent}`,
                  borderRadius: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: '54px',
                  lineHeight: '1',
                  fontWeight: '900',
                  boxSizing: 'border-box',
                  minHeight: 0,
                }}
              >
                {displayNumber}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
