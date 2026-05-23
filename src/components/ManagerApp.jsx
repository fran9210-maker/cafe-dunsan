import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc
} from 'firebase/firestore';
import { colors, Logo } from '../utils/theme';

export default function ManagerApp() {
  const [orders, setOrders] = useState([]);
  const [qrInput, setQrInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'orders'));

    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const orderList = snapshot.docs.map(document => ({
          id: document.id,
          ...document.data()
        }));

        setOrders(orderList);
        setLoading(false);
      },
      error => {
        console.error('주문 목록 불러오기 실패:', error);
        setMessage('주문 목록을 불러오지 못했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const getTimeValue = order => {
    return Number(
      order.paidAt ||
      order.qrVerifiedAt ||
      order.updatedAt ||
      order.createdAt ||
      0
    );
  };

  const visibleOrders = useMemo(() => {
    return orders
      .filter(order => order.qrVerified === true)
      .sort((a, b) => getTimeValue(b) - getTimeValue(a));
  }, [orders]);

  const extractOrderIdFromQr = value => {
    if (!value) return '';

    const trimmed = String(value).trim();

    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);

      if (parts.length > 0) {
        return parts[parts.length - 1];
      }

      return trimmed;
    } catch {
      return trimmed;
    }
  };

  const handleVerifyQr = async () => {
    setMessage('');

    const orderId = extractOrderIdFromQr(qrInput);

    if (!orderId) {
      setMessage('QR 코드 값을 입력해주세요.');
      return;
    }

    try {
      setVerifying(true);

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        setMessage('해당 QR 코드와 일치하는 주문을 찾을 수 없습니다.');
        return;
      }

      const orderData = orderSnap.data();

      if (orderData.qrVerified === true) {
        setMessage('이미 QR 확인이 완료된 주문입니다.');
        setQrInput('');
        return;
      }

      const now = Date.now();

      await updateDoc(orderRef, {
        qrVerified: true,
        qrVerifiedAt: now,

        // QR 확인을 결제 완료로 처리
        paymentStatus: 'completed',
        paidAt: now,

        // 주문 상태는 제조 대기 상태 유지
        status: orderData.status || 'pending',

        updatedAt: now
      });

      setMessage('QR 확인 완료! 주문서가 매니저 화면과 제조 화면에 표시됩니다.');
      setQrInput('');
    } catch (error) {
      console.error('QR 확인 실패:', error);
      setMessage('QR 확인 중 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyDown = event => {
    if (event.key === 'Enter') {
      handleVerifyQr();
    }
  };

  const handleUpdateStatus = async (orderId, nextStatus) => {
    try {
      const now = Date.now();

      const updateData = {
        status: nextStatus,
        updatedAt: now
      };

      if (nextStatus === 'completed') {
        updateData.completedAt = now;
        updateData.displayHidden = false;
      }

      await updateDoc(doc(db, 'orders', orderId), updateData);
    } catch (error) {
      console.error('주문 상태 변경 실패:', error);
      alert('주문 상태 변경에 실패했습니다.');
    }
  };

  const formatDate = value => {
    if (!value) return '-';

    let date;

    if (typeof value === 'number') {
      date = new Date(value);
    } else if (value?.toDate) {
      date = value.toDate();
    } else {
      return '-';
    }

    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPhone = value => {
    if (!value) return '-';

    const onlyNumber = String(value).replace(/[^0-9]/g, '');

    if (onlyNumber.length === 11) {
      return onlyNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }

    if (onlyNumber.length === 10) {
      return onlyNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }

    return onlyNumber;
  };

  const getStatusLabel = status => {
    switch (status) {
      case 'pending':
        return '대기중';
      case 'manufacturing':
        return '제조중';
      case 'completed':
        return '완료';
      case 'cancelled':
        return '취소';
      default:
        return '대기중';
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'pending':
        return colors.primary;
      case 'manufacturing':
        return '#74b9ff';
      case 'completed':
        return '#00b894';
      case 'cancelled':
        return colors.danger;
      default:
        return colors.primary;
    }
  };

  const getOrderNumber = order => {
    return order.orderNumber || order.pickupNumber || order.id.slice(0, 6).toUpperCase();
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: colors.bg,
          color: colors.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif'
        }}
      >
        주문 목록을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.text,
        fontFamily: 'sans-serif',
        padding: '24px',
        boxSizing: 'border-box'
      }}
    >
      <header
        style={{
          maxWidth: '1200px',
          margin: '0 auto 24px auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}
      >
        <div>
          <Logo />

          <h1
            style={{
              margin: '20px 0 8px 0',
              color: colors.primary,
              fontSize: '32px'
            }}
          >
            매니저 주문 관리
          </h1>

          <p
            style={{
              margin: 0,
              color: colors.textDim,
              fontSize: '15px'
            }}
          >
            QR 코드가 확인된 주문만 이 화면에 표시됩니다.
          </p>
        </div>

        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '16px',
            padding: '18px 24px',
            textAlign: 'center',
            minWidth: '120px'
          }}
        >
          <div style={{ color: colors.textDim, fontSize: '14px' }}>
            확인 주문
          </div>

          <strong
            style={{
              display: 'block',
              color: colors.primary,
              fontSize: '34px',
              marginTop: '4px'
            }}
          >
            {visibleOrders.length}
          </strong>
        </div>
      </header>

      <section
        style={{
          maxWidth: '1200px',
          margin: '0 auto 24px auto',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '18px',
          padding: '24px',
          boxSizing: 'border-box'
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            color: colors.primary,
            fontSize: '24px'
          }}
        >
          QR 코드 확인
        </h2>

        <p
          style={{
            margin: '0 0 16px 0',
            color: colors.textDim,
            fontSize: '14px'
          }}
        >
          고객 화면에 표시된 QR 코드를 스캔하거나, QR 코드 값을 직접 입력하세요.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px',
            gap: '12px'
          }}
        >
          <input
            value={qrInput}
            onChange={event => setQrInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="QR 코드 값을 입력하거나 스캔하세요"
            autoFocus
            style={{
              height: '56px',
              padding: '0 16px',
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.bg,
              color: colors.text,
              fontSize: '18px',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />

          <button
            onClick={handleVerifyQr}
            disabled={verifying}
            style={{
              height: '56px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: verifying ? colors.border : colors.primary,
              color: '#000',
              fontWeight: 'bold',
              fontSize: '18px',
              cursor: verifying ? 'not-allowed' : 'pointer'
            }}
          >
            {verifying ? '확인중' : '확인'}
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              color: colors.primary,
              fontWeight: 'bold',
              lineHeight: 1.5
            }}
          >
            {message}
          </div>
        )}
      </section>

      <section
        style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >
        <h2
          style={{
            margin: '0 0 16px 0',
            color: colors.primary,
            fontSize: '24px'
          }}
        >
          확인된 주문서
        </h2>

        {visibleOrders.length === 0 ? (
          <div
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: '18px',
              padding: '50px 20px',
              textAlign: 'center',
              color: colors.textDim,
              fontSize: '18px'
            }}
          >
            아직 QR 확인된 주문이 없습니다.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '18px'
            }}
          >
            {visibleOrders.map(order => (
              <div
                key={order.id}
                style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '18px',
                  padding: '20px',
                  boxSizing: 'border-box'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'flex-start',
                    marginBottom: '16px'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: colors.primary
                      }}
                    >
                      주문 #{getOrderNumber(order)}
                    </div>

                    <div
                      style={{
                        marginTop: '6px',
                        color: colors.textDim,
                        fontSize: '13px'
                      }}
                    >
                      QR 확인: {formatDate(order.qrVerifiedAt)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '999px',
                      backgroundColor: getStatusColor(order.status),
                      color: order.status === 'pending' ? '#000' : '#fff',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {getStatusLabel(order.status)}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '12px',
                    padding: '14px',
                    marginBottom: '16px'
                  }}
                >
                  <InfoRow label="연락처" value={formatPhone(order.phone)} />
                  <InfoRow label="주문시간" value={`${order.date || ''} ${order.time || ''}`} />
                  <InfoRow label="결제금액" value={`${Number(order.totalPrice || 0).toLocaleString()}원`} />
                  <InfoRow label="사용포인트" value={`${Number(order.usedPoints || 0).toLocaleString()} P`} />
                  <InfoRow label="적립예정" value={`${Number(order.earnedPoints || 0).toLocaleString()} P`} />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h3
                    style={{
                      margin: '0 0 10px 0',
                      color: colors.text,
                      fontSize: '18px'
                    }}
                  >
                    주문 메뉴
                  </h3>

                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item, index) => (
                      <div
                        key={`${item.id || index}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto',
                          gap: '10px',
                          padding: '12px 0',
                          borderBottom: `1px solid ${colors.border}`
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 'bold',
                              color: colors.text,
                              marginBottom: '4px'
                            }}
                          >
                            {item.name || '메뉴명 없음'}
                          </div>

                          <div
                            style={{
                              color: colors.textDim,
                              fontSize: '13px',
                              lineHeight: 1.5
                            }}
                          >
                            {item.selectedHotIce && `[${item.selectedHotIce}] `}
                            {item.selectedShot && '[샷 추가] '}
                            {Number(item.finalPrice || 0).toLocaleString()}원
                          </div>
                        </div>

                        <div
                          style={{
                            color: colors.primary,
                            fontWeight: 'bold',
                            fontSize: '18px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          x {Number(item.quantity || 1)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: colors.textDim }}>
                      메뉴 정보가 없습니다.
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px'
                  }}
                >
                  <button
                    onClick={() => handleUpdateStatus(order.id, 'pending')}
                    style={{
                      ...statusButtonStyle,
                      backgroundColor: colors.primary,
                      color: '#000'
                    }}
                  >
                    대기
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'manufacturing')}
                    style={{
                      ...statusButtonStyle,
                      backgroundColor: '#74b9ff',
                      color: '#fff'
                    }}
                  >
                    제조중
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'completed')}
                    style={{
                      ...statusButtonStyle,
                      backgroundColor: '#00b894',
                      color: '#fff'
                    }}
                  >
                    완료
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                    style={{
                      ...statusButtonStyle,
                      backgroundColor: colors.danger,
                      color: '#fff'
                    }}
                  >
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '8px',
        fontSize: '14px'
      }}
    >
      <span style={{ color: colors.textDim, whiteSpace: 'nowrap' }}>
        {label}
      </span>

      <strong
        style={{
          color: colors.text,
          textAlign: 'right',
          wordBreak: 'break-all'
        }}
      >
        {value || '-'}
      </strong>
    </div>
  );
}

const statusButtonStyle = {
  height: '42px',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer'
};
