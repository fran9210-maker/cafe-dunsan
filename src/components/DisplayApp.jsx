import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

const colors = {
  accent: '#FACC15',
};

export default function DisplayApp() {
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);

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

        const completed = orders.filter((order) =>
          ['ready', 'completed', 'done', '제조완료', '픽업대기'].includes(order.status)
        );

        setCompletedOrders(completed);
        setLoading(false);
      },
      (error) => {
        console.error('Display orders load error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#000000',
        minHeight: '100vh',
        color: '#FFFFFF',
        padding: '40px',
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          textAlign: 'center',
          fontSize: '56px',
          color: colors.accent,
          marginBottom: '60px',
          fontWeight: '900',
        }}
      >
        픽업 대기
      </h1>

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            fontSize: '36px',
            color: '#FFFFFF',
            marginTop: '80px',
          }}
        >
          로딩중...
        </div>
      ) : completedOrders.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            fontSize: '36px',
            color: '#9CA3AF',
            marginTop: '80px',
          }}
        >
          픽업 대기 중인 주문이 없습니다
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '30px',
          }}
        >
          {completedOrders.map((order, index) => {
            const rawId = order?.id || order?.orderId || order?.firestoreId;

            const orderNumber = rawId
              ? String(rawId).replace('ORD-', '')
              : `번호없음-${index + 1}`;

            return (
              <div
                key={order?.firestoreId || order?.id || index}
                style={{
                  backgroundColor: '#1F2937',
                  border: `6px solid ${colors.accent}`,
                  borderRadius: '24px',
                  padding: '40px 10px',
                  textAlign: 'center',
                  fontSize: '64px',
                  fontWeight: '900',
                }}
              >
                {orderNumber}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
