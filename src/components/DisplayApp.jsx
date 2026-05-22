import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

const colors = {
  accent: '#FACC15',
  background: '#000000',
  card: '#1F2937',
  cardStopped: '#111827',
  muted: '#9CA3AF',
  error: '#F87171',
  white: '#FFFFFF',
  danger: '#EF4444',
  border: '#374151',
};

const READY_STATUSES = [
  'ready',
  'completed',
  'done',
  '제조완료',
  '픽업대기',
];

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function isReadyOrder(order) {
  const status = normalizeText(order?.status);

  if (order?.displayHidden === true) {
    return false;
  }

  return READY_STATUSES.map((item) => normalizeText(item)).includes(status);
}

function getOrderId(order) {
  return order?.firestoreId || order?.id || '';
}

function getPhoneLastDigits(order) {
  const phoneValue =
    order?.phone ||
    order?.phoneNumber ||
    order?.customerPhone ||
    order?.customerPhoneNumber ||
    order?.tel ||
    order?.mobile ||
    order?.userPhone ||
    order?.buyerPhone ||
    '';

  const digitsOnly = String(phoneValue).replace(/\D/g, '');

  if (!digitsOnly) {
    return '';
  }

  return digitsOnly.slice(-4);
}

function getDateTimeFromDateAndTime(order) {
  if (!order?.date || !order?.time) {
    return null;
  }

  const parsedDate = new Date(`${order.date} ${order.time}`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getTime();
}

function getOrderTimeValue(order) {
  const value =
    order?.completedAt ||
    order?.readyAt ||
    order?.updatedAt ||
    order?.paidAt ||
    order?.createdAt ||
    order?.created_at ||
    order?.timestamp ||
    null;

  if (value) {
    try {
      if (value?.toDate) {
        return value.toDate().getTime();
      }

      if (value instanceof Date) {
        return value.getTime();
      }

      if (typeof value === 'number') {
        return value;
      }

      const parsedDate = new Date(value);

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.getTime();
      }
    } catch (error) {
      return 0;
    }
  }

  const dateTimeValue = getDateTimeFromDateAndTime(order);

  if (dateTimeValue) {
    return dateTimeValue;
  }

  return 0;
}

export default function DisplayApp() {
  const [completedOrders, setCompletedOrders] = useState([]);
  const [stoppedBlinkIds, setStoppedBlinkIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const ordersQuery = query(collection(db, 'orders'));

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orders = snapshot.docs.map((doc) => ({
          firestoreId: doc.id,
          ...doc.data(),
        }));

        const completed = orders
          .filter((order) => isReadyOrder(order))
          .sort((a, b) => getOrderTimeValue(b) - getOrderTimeValue(a))
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

  const handleHideOrder = async (order) => {
    const phoneLastDigits = getPhoneLastDigits(order);
    const displayNumber = phoneLastDigits || '번호 없음';

    const confirmed = window.confirm(
      `${displayNumber}번을 픽업화면에서 삭제할까요?\n\n주문 기록은 삭제되지 않고, 픽업 화면에서만 사라집니다.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const now = Date.now();
      const orderId = getOrderId(order);

      if (!orderId) {
        alert('주문 ID를 찾을 수 없습니다.');
        return;
      }

      await updateDoc(doc(db, 'orders', orderId), {
        displayHidden: true,
        pickedUpAt: now,
        updatedAt: now,
      });

      setStoppedBlinkIds((prev) => prev.filter((id) => id !== orderId));
    } catch (error) {
      console.error('픽업화면 개별 삭제 실패:', error);
      alert('픽업화면에서 삭제하지 못했습니다.');
    }
  };

  const handleOrderClick = async (order) => {
    const orderId = getOrderId(order);

    if (!orderId) {
      alert('주문 ID를 찾을 수 없습니다.');
      return;
    }

    const alreadyStopped = stoppedBlinkIds.includes(orderId);

    if (!alreadyStopped) {
      setStoppedBlinkIds((prev) => [...prev, orderId]);
      return;
    }

    await handleHideOrder(order);
  };

  const handleHideAllOrders = async () => {
    if (completedOrders.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `현재 표시된 ${completedOrders.length}개의 번호를 모두 픽업화면에서 삭제할까요?\n\n주문 기록은 삭제되지 않고, 픽업 화면에서만 사라집니다.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessing(true);

      const now = Date.now();

      await Promise.all(
        completedOrders.map((order) => {
          const orderId = getOrderId(order);

          if (!orderId) {
            return Promise.resolve();
          }

          return updateDoc(doc(db, 'orders', orderId), {
            displayHidden: true,
            pickedUpAt: now,
            updatedAt: now,
          });
        })
      );

      setStoppedBlinkIds([]);
    } catch (error) {
      console.error('픽업화면 전체 삭제 실패:', error);
      alert('전체 삭제 처리에 실패했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: colors.background,
        height: '100vh',
        color: colors.white,
        padding: '24px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>
        {`
          @keyframes pickupBorderBlink {
            0% {
              border-color: #FACC15;
              box-shadow: 0 0 8px rgba(250, 204, 21, 0.45);
            }

            50% {
              border-color: #FFFFFF;
              box-shadow: 0 0 28px rgba(250, 204, 21, 1);
            }

            100% {
              border-color: #FACC15;
              box-shadow: 0 0 8px rgba(250, 204, 21, 0.45);
            }
          }

          @keyframes pickupNumberPulse {
            0% {
              transform: scale(1);
            }

            50% {
              transform: scale(1.04);
            }

            100% {
              transform: scale(1);
            }
          }

          .pickup-card-blinking {
            animation: pickupBorderBlink 1s infinite, pickupNumberPulse 1s infinite;
          }

          .pickup-card-stopped {
            animation: none;
          }
        `}
      </style>

      <div
        style={{
          position: 'relative',
          marginBottom: '24px',
        }}
      >
        <h1
          style={{
            textAlign: 'center',
            fontSize: '46px',
            lineHeight: '1',
            color: colors.accent,
            margin: 0,
            fontWeight: '900',
          }}
        >
          픽업 대기
        </h1>

        {completedOrders.length > 0 && !loading && !errorMessage ? (
          <button
            onClick={handleHideAllOrders}
            disabled={processing}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: processing ? colors.border : colors.danger,
              color: colors.white,
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              fontSize: '16px',
              fontWeight: '900',
              cursor: processing ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? '처리중...' : '전체 삭제'}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '34px',
            color: colors.white,
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
            const orderId = getOrderId(order);
            const phoneLastDigits = getPhoneLastDigits(order);
            const displayNumber = phoneLastDigits || `없음${index + 1}`;
            const isBlinkStopped = stoppedBlinkIds.includes(orderId);

            return (
              <button
                key={orderId || index}
                onClick={() => handleOrderClick(order)}
                title={
                  isBlinkStopped
                    ? '다시 클릭하면 픽업화면에서 삭제됩니다'
                    : '클릭하면 깜박임이 멈춥니다'
                }
                className={
                  isBlinkStopped
                    ? 'pickup-card-stopped'
                    : 'pickup-card-blinking'
                }
                style={{
                  backgroundColor: isBlinkStopped ? colors.cardStopped : colors.card,
                  border: `5px solid ${isBlinkStopped ? colors.border : colors.accent}`,
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
                  color: isBlinkStopped ? colors.muted : colors.white,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {displayNumber}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
