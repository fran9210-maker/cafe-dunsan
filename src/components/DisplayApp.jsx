import React from 'react';

const colors = {
  accent: '#FACC15',
};

export default function DisplayApp() {
  const completedOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '30px',
        }}
      >
        {completedOrders.map((order, index) => {
          const orderNumber = order?.id
            ? String(order.id).replace('ORD-', '')
            : `번호없음-${index + 1}`;

          return (
            <div
              key={order?.id || index}
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
    </div>
  );
}
