import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
} from 'firebase/firestore';
import { db } from '../firebase';

const colors = {
  background: '#111827',
  card: '#1F2937',
  cardHighlight: '#263449',
  accent: '#FACC15',
  white: '#FFFFFF',
  muted: '#9CA3AF',
  border: '#374151',
  green: '#22C55E',
  red: '#F87171',
  blue: '#60A5FA',
};

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function isManufactureOrder(order) {
  const status = normalizeText(order?.status);
  const paymentStatus = normalizeText(order?.paymentStatus);

  // 현재 ManagerApp 기준:
  // 결제 완료 버튼 → paymentStatus: 'completed'
  // 조리 완료 버튼 → status: 'completed'
  // 제조 화면에는 status가 pending이고 paymentStatus가 completed인 주문만 표시
  if (status === 'pending' && paymentStatus === 'completed') {
    return true;
  }

  // 예외적으로 다른 결제완료 표현도 허용
  if (
    status === 'pending' &&
    (
      paymentStatus === 'paid' ||
      paymentStatus === '결제완료' ||
      paymentStatus === 'payment_completed' ||
      paymentStatus === 'paymentcomplete'
    )
  ) {
    return true;
  }

  return false;
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
    return '번호없음';
  }

  return digitsOnly.slice(-4);
}

function getOrderTimeRaw(order) {
  // 제조 화면에서는 결제 완료 시간이 가장 중요합니다.
  // 나중에 ManagerApp에서 paidAt을 저장하면 paidAt 기준으로 자동 정렬됩니다.
  return (
    order?.paidAt ||
    order?.paymentAt ||
    order?.paymentCompletedAt ||
    order?.updatedAt ||
    order?.createdAt ||
    order?.created_at ||
    order?.orderTime ||
    order?.orderedAt ||
    order?.timestamp ||
    order?.date ||
    order?.time ||
    null
  );
}

function getDateTimeFromDateAndTime(order) {
  if (!order?.date || !order?.time) {
    return null;
  }

  const dateTimeText = `${order.date} ${order.time}`;
  const parsedDate = new Date(dateTimeText);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.getTime();
}

function getOrderTimeValue(order) {
  // date + time 조합이 있으면 우선 시도
  const dateTimeValue = getDateTimeFromDateAndTime(order);

  if (dateTimeValue) {
    return dateTimeValue;
  }

  const value = getOrderTimeRaw(order);

  if (!value) {
    return 0;
  }

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

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 0;
    }

    return date.getTime();
  } catch (error) {
    return 0;
  }
}

function formatTimeFromOrder(order) {
  if (order?.time) {
    return String(order.time);
  }

  const value = getOrderTimeRaw(order);

  if (!value) {
    return '';
  }

  try {
    let date;

    if (value?.toDate) {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number') {
      date = new Date(value);
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  } catch (error) {
    return '';
  }
}

function normalizeItems(order) {
  const possibleItems =
    order?.items ||
    order?.cart ||
    order?.menus ||
    order?.orderItems ||
    order?.selectedMenus ||
    order?.products ||
    order?.productList ||
    order?.menuList ||
    [];

  if (Array.isArray(possibleItems)) {
    return possibleItems;
  }

  return [];
}

function getItemName(item) {
  return (
    item?.name ||
    item?.menuName ||
    item?.title ||
    item?.productName ||
    item?.label ||
    item?.displayName ||
    '메뉴명 없음'
  );
}

function getItemQuantity(item) {
  return (
    item?.quantity ||
    item?.qty ||
    item?.count ||
    item?.amount ||
    item?.num ||
    1
  );
}

function getItemOptions(item) {
  const optionParts = [];

  if (item?.selectedHotIce) {
    optionParts.push(item.selectedHotIce);
  }

  if (item?.selectedShot) {
    optionParts.push('샷 추가');
  }

  const options =
    item?.options ||
    item?.option ||
    item?.selectedOptions ||
    item?.temperature ||
    item?.size ||
    item?.ice ||
    item?.shot ||
    item?.extra ||
    '';

  if (options) {
    if (Array.isArray(options)) {
      options.forEach((option) => {
        if (typeof option === 'string') {
          optionParts.push(option);
        } else {
          const optionText =
            option?.name ||
            option?.label ||
            option?.value ||
            option?.title ||
            '';
          if (optionText) {
            optionParts.push(optionText);
          }
        }
      });
    } else if (typeof options === 'object') {
      Object.entries(options).forEach(([key, value]) => {
        if (value === true) {
          optionParts.push(key);
        } else if (
          value !== false &&
          value !== null &&
          value !== undefined &&
          value !== ''
        ) {
          optionParts.push(`${key}: ${value}`);
        }
      });
    } else {
      optionParts.push(String(options));
    }
  }

  return optionParts.join(', ');
}

function getRequestText(order) {
  return (
    order?.request ||
    order?.memo ||
    order?.note ||
    order?.message ||
    order?.specialRequest ||
    order?.requestText ||
    order?.customerRequest ||
    ''
  );
}

export default function ManufactureApp() {
  const [orders, setOrders] = useState([]);
  const [totalManufactureCount, setTotalManufactureCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // createdAt이 없는 주문도 가져오기 위해 orderBy를 쓰지 않습니다.
    const ordersQuery = query(collection(db, 'orders'));

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orderList = snapshot.docs.map((doc) => ({
          firestoreId: doc.id,
          ...doc.data(),
        }));

        const manufactureOrders = orderList
          .filter((order) => isManufactureOrder(order))
          .sort((a, b) => {
            const aTime = getOrderTimeValue(a);
            const bTime = getOrderTimeValue(b);

            // 최신 주문/최신 결제 완료 주문이 앞에 오도록 정렬
            return bTime - aTime;
          });

        setTotalManufactureCount(manufactureOrders.length);
        setOrders(manufactureOrders.slice(0, 12));
        setLoading(false);
        setErrorMessage('');
      },
      (error) => {
        console.error('Manufacture orders load error:', error);
        setErrorMessage(error.message || '제조 주문을 불러오지 못했습니다.');
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
        color: colors.white,
        padding: '18px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <h1
          style={{
            fontSize: '34px',
            lineHeight: '1',
            margin: 0,
            color: colors.accent,
            fontWeight: '900',
          }}
        >
          제조 주문
        </h1>

        <div
          style={{
            fontSize: '18px',
            color: colors.muted,
            fontWeight: '700',
          }}
        >
          대기 주문 {totalManufactureCount}건
        </div>
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
          }}
        >
          로딩중...
        </div>
      ) : errorMessage ? (
        <div
          style={{
            flex: 1,
            color: colors.red,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: '22px',
            lineHeight: '1.5',
          }}
        >
          <div>
            제조 주문을 불러오지 못했습니다.
            <br />
            {errorMessage}
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div
          style={{
            flex: 1,
            color: colors.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          제조할 주문이 없습니다
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: '12px',
            minHeight: 0,
          }}
        >
          {orders.map((order, index) => {
            const phoneLastDigits = getPhoneLastDigits(order);
            const items = normalizeItems(order);
            const requestText = getRequestText(order);
            const orderTime = formatTimeFromOrder(order);

            return (
              <div
                key={order?.firestoreId || order?.id || index}
                style={{
                  backgroundColor: index === 0 ? colors.cardHighlight : colors.card,
                  border: `2px solid ${index === 0 ? colors.accent : colors.border}`,
                  borderRadius: '16px',
                  padding: '12px',
                  boxSizing: 'border-box',
                  minHeight: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${colors.border}`,
                    paddingBottom: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '28px',
                      fontWeight: '900',
                      color: colors.accent,
                      lineHeight: '1',
                    }}
                  >
                    {phoneLastDigits}
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: '13px',
                      color: colors.muted,
                      fontWeight: '700',
                    }}
                  >
                    <div>{orderTime || '시간없음'}</div>
                    <div>결제완료</div>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  {items.length === 0 ? (
                    <div
                      style={{
                        fontSize: '15px',
                        color: colors.red,
                        fontWeight: '700',
                      }}
                    >
                      메뉴 정보 없음
                    </div>
                  ) : (
                    items.slice(0, 5).map((item, itemIndex) => {
                      const itemName = getItemName(item);
                      const quantity = getItemQuantity(item);
                      const options = getItemOptions(item);

                      return (
                        <div
                          key={itemIndex}
                          style={{
                            marginBottom: '7px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '8px',
                              fontSize: '16px',
                              fontWeight: '900',
                              lineHeight: '1.25',
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {itemName}
                            </span>

                            <span
                              style={{
                                color: colors.green,
                                flexShrink: 0,
                              }}
                            >
                              x{quantity}
                            </span>
                          </div>

                          {options ? (
                            <div
                              style={{
                                fontSize: '12px',
                                color: colors.muted,
                                lineHeight: '1.25',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: '2px',
                              }}
                            >
                              {options}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>

                {items.length > 5 ? (
                  <div
                    style={{
                      fontSize: '12px',
                      color: colors.blue,
                      fontWeight: '800',
                      marginTop: '4px',
                    }}
                  >
                    외 {items.length - 5}개 메뉴 더 있음
                  </div>
                ) : null}

                {requestText ? (
                  <div
                    style={{
                      marginTop: '8px',
                      paddingTop: '7px',
                      borderTop: `1px solid ${colors.border}`,
                      fontSize: '12px',
                      color: colors.accent,
                      lineHeight: '1.25',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: '700',
                    }}
                  >
                    요청: {requestText}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
