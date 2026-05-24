import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  orderBy,
  getDocs,
  where,
} from 'firebase/firestore';
import { colors, Logo } from '../utils/theme';
import Statistics from "./StatisticsView";

// 주문 정렬용 함수
// paidAt이 있으면 결제 완료 시간 기준으로 정렬하고,
// 없으면 qrVerifiedAt, updatedAt, createdAt, date+time 순서로 안전하게 정렬합니다.
function getOrderSortTime(order) {
  const value =
    order?.paidAt ||
    order?.qrVerifiedAt ||
    order?.updatedAt ||
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

  if (order?.date && order?.time) {
    const parsedDate = new Date(`${order.date} ${order.time}`);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.getTime();
    }
  }

  return 0;
}

function formatPhone(phone) {
  if (!phone) {
    return '번호 없음';
  }

  const digitsOnly = String(phone).replace(/\D/g, '');

  if (digitsOnly.length === 11) {
    return digitsOnly.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }

  if (digitsOnly.length === 10) {
    return digitsOnly.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }

  return String(phone);
}

function normalizeQrCode(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .trim()
    .replace(/[^0-9]/g, '')
    .slice(0, 6);
}

export default function ManagerApp() {
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('');
  
  const [useHotIce, setUseHotIce] = useState(false);
  const [hotPrice, setHotPrice] = useState(0);
  const [icePrice, setIcePrice] = useState(0);
  const [useShot, setUseShot] = useState(false);
  const [shotPrice, setShotPrice] = useState(500);

  const [qrInput, setQrInput] = useState('');
  const [qrMessage, setQrMessage] = useState('');
  const [qrChecking, setQrChecking] = useState(false);

  useEffect(() => {
    // createdAt이 없는 주문도 누락되지 않도록 orderBy를 제거하고,
    // 가져온 뒤 프론트에서 안전하게 최신순 정렬합니다.
    const q = query(collection(db, 'orders'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orderList = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data(),
        }))
        .sort((a, b) => getOrderSortTime(b) - getOrderSortTime(a));

      setOrders(orderList);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'menus'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMenus(snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      })));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));

      setCategories(cats);

      if (cats.length > 0 && !newMenuCategory) {
        setNewMenuCategory(cats[0].name);
      }
    });

    return () => unsubscribe();
  }, [newMenuCategory]);

  const handleVerifyQr = async () => {
  const qrCode = normalizeQrCode(qrInput);

  setQrMessage('');

  if (!qrCode) {
    setQrMessage('QR 코드를 스캔하거나 숫자 6자리 코드를 입력해주세요.');
    return;
  }

  if (qrCode.length !== 6) {
    setQrMessage('QR 코드는 숫자 6자리여야 합니다.');
    return;
  }

  try {
    setQrChecking(true);

    const orderQuery = query(
      collection(db, 'orders'),
      where('qrCode', '==', qrCode)
    );

    const orderSnapshot = await getDocs(orderQuery);

    if (orderSnapshot.empty) {
      setQrMessage('해당 QR 코드와 일치하는 주문을 찾을 수 없습니다.');
      return;
    }

    const orderDocument = orderSnapshot.docs[0];
    const orderData = orderDocument.data();
    const orderId = orderDocument.id;
    const orderRef = doc(db, 'orders', orderId);

    if (orderData.qrVerified === true) {
      setQrMessage(`이미 QR 확인된 주문입니다. 결제 완료는 담당자가 버튼으로 처리해주세요. 주문 코드: ${qrCode}`);
      setQrInput('');
      setActiveTab('pending');
      return;
    }

    const now = Date.now();

    const updatedOrder = {
      id: orderId,
      ...orderData,
      qrVerified: true,
      qrVerifiedAt: now,

      // QR 확인은 주문 접수만 의미합니다.
      // 결제 완료는 결제 완료 버튼을 눌렀을 때만 처리합니다.
      paymentStatus: orderData.paymentStatus || 'pending',
      paidAt: orderData.paidAt || null,

      status: orderData.status || 'pending',
      updatedAt: now,
    };

    await updateDoc(orderRef, {
      qrVerified: true,
      qrVerifiedAt: now,

      // 중요:
      // QR 스캔 시에는 결제 완료 처리하지 않음
      paymentStatus: orderData.paymentStatus || 'pending',
      paidAt: orderData.paidAt || null,

      status: orderData.status || 'pending',
      updatedAt: now,
    });

    setQrMessage(`QR 확인 완료! 주문 코드 ${qrCode} 주문이 접수되었습니다. 결제 완료는 담당자가 버튼을 눌러주세요.`);
    setQrInput('');
    setActiveTab('pending');

    // QR 확인 시 주방 주문서는 출력할 수 있습니다.
    // 단, 결제 상태는 아직 pending입니다.
    handlePrint(updatedOrder, 'order');
  } catch (error) {
    console.error('QR 확인 실패:', error);
    setQrMessage('QR 확인 중 오류가 발생했습니다.');
  } finally {
    setQrChecking(false);
  }
};

  const handleQrKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleVerifyQr();
    }
  };

  const handleQrInputChange = (event) => {
    setQrInput(normalizeQrCode(event.target.value));
  };

  const handleComplete = async (orderId) => {
    try {
      const completedAt = Date.now();

      await updateDoc(doc(db, 'orders', orderId), {
        status: 'completed',
        completedAt,
        updatedAt: completedAt,
        displayHidden: false,
      });
    } catch (error) {
      console.error("상태 업데이트 실패:", error);
      alert("조리 완료 처리에 실패했습니다.");
    }
  };

  const handlePaymentComplete = async (order) => {
    try {
      const paidAt = Date.now();

      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'completed',
        paidAt,
        qrVerified: true,
        qrVerifiedAt: order.qrVerifiedAt || paidAt,
        updatedAt: paidAt,
      });

      handlePrint(
        {
          ...order,
          paymentStatus: 'completed',
          qrVerified: true,
          qrVerifiedAt: order.qrVerifiedAt || paidAt,
          paidAt,
          updatedAt: paidAt,
        },
        ''receipt'
      );
    } catch (error) {
      console.error("결제 상태 업데이트 실패:", error);
      alert("결제 완료 처리에 실패했습니다.");
    }
  };

  const handlePrint = (order, type) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');

    if (!printWindow) {
      return alert("팝업 차단이 설정되어 있습니다. 팝업을 허용해주세요.");
    }

    const isReceipt = type === 'receipt';
    const title = isReceipt ? '영수증 (고객용)' : '주문서 (주방용)';
    const storeName = isReceipt ? '그대, 요한을 만나다' : '[주방 제조용 주문서]';

    const phoneText = order.phone ? formatPhone(order.phone) : '번호 없음';
    const orderDate = order.date || '';
    const orderTime = order.time || '';
    const orderCode = order.qrCode || String(order.id || '').slice(-4).toUpperCase();

    const itemsHtml = Array.isArray(order.items)
      ? order.items.map((item) => `
          <div class="item">
            <span>${item.name || '메뉴명 없음'} x ${item.quantity || 1}</span>
            ${isReceipt ? `<span>${Number((item.finalPrice || 0) * (item.quantity || 1)).toLocaleString()}원</span>` : ''}
          </div>
          <div class="options">
            ${item.selectedHotIce ? `[${item.selectedHotIce}] ` : ''}
            ${item.selectedShot ? `[샷 추가]` : ''}
          </div>
        `).join('')
      : '<div>메뉴 정보 없음</div>';

    const htmlContent = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: 'Malgun Gothic', sans-serif;
              width: 300px;
              margin: 0 auto;
              padding: 20px;
              color: #000;
            }

            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px dashed #000;
              padding-bottom: 15px;
            }

            .header h2 {
              margin: 0 0 10px 0;
              font-size: 22px;
            }

            .header p {
              margin: 5px 0;
              font-size: 14px;
            }

            .item {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
              font-weight: bold;
              font-size: 16px;
            }

            .options {
              font-size: 14px;
              color: #555;
              margin-left: 10px;
              margin-bottom: 15px;
              min-height: 16px;
            }

            .total {
              margin-top: 20px;
              border-top: 2px dashed #000;
              padding-top: 15px;
              font-weight: bold;
              font-size: 20px;
              display: flex;
              justify-content: space-between;
            }

            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 14px;
              color: #555;
            }

            .order-num {
              font-size: 24px;
              font-weight: bold;
              text-align: center;
              padding: 10px;
              border: 2px solid #000;
              margin-bottom: 20px;
            }

            .qr-code {
              text-align: center;
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 10px;
            }

            .sub-row {
              display: flex;
              justify-content: space-between;
              font-size: 14px;
              margin-top: 8px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${storeName}</h2>
            <p>주문일시: ${orderDate} ${orderTime}</p>
            ${isReceipt ? `<p>고객번호: ${phoneText}</p>` : ''}
          </div>

          ${!isReceipt ? `<div class="order-num">주문번호: ${orderCode}</div>` : ''}
          ${isReceipt ? `<div class="qr-code">주문 코드: ${orderCode}</div>` : ''}

          <div>
            ${itemsHtml}
          </div>

          ${isReceipt ? `
            <div class="sub-row">
              <span>상품 합계</span>
              <span>${Number(order.subtotalPrice || order.totalPrice || 0).toLocaleString()}원</span>
            </div>

            <div class="sub-row">
              <span>포인트 사용</span>
              <span>-${Number(order.usedPoints || 0).toLocaleString()}원</span>
            </div>

            <div class="total">
              <span>총 결제 금액</span>
              <span>${Number(order.totalPrice || 0).toLocaleString()}원</span>
            </div>

            <div class="footer">
              이용해 주셔서 감사합니다.<br/>
              적립된 포인트: ${order.earnedPoints ? Number(order.earnedPoints).toLocaleString() : 0} P
            </div>
          ` : `
            <div class="footer">
              - 제조가 완료되면 고객에게 알려주세요 -
            </div>
          `}
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();

    if (!newCategoryName.trim()) {
      return;
    }

    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        createdAt: Date.now(),
      });

      setNewCategoryName('');
    } catch (error) {
      console.error("카테고리 추가 실패:", error);
      alert("카테고리 추가에 실패했습니다.");
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'categories', categoryId));
    } catch (error) {
      console.error("카테고리 삭제 실패:", error);
      alert("카테고리 삭제에 실패했습니다.");
    }
  };

  const handleAddMenu = async (e) => {
    e.preventDefault();

    if (!newMenuName || !newMenuPrice || !newMenuCategory) {
      return alert("모두 입력해주세요.");
    }

    try {
      await addDoc(collection(db, 'menus'), {
        name: newMenuName,
        price: Number(newMenuPrice),
        category: newMenuCategory,
        options: {
          useHotIce,
          hotPrice: Number(hotPrice),
          icePrice: Number(icePrice),
          useShot,
          shotPrice: Number(shotPrice),
        },
        createdAt: Date.now(),
      });

      setNewMenuName('');
      setNewMenuPrice('');
      setUseHotIce(false);
      setHotPrice(0);
      setIcePrice(0);
      setUseShot(false);
      setShotPrice(500);
    } catch (error) {
      console.error("메뉴 추가 실패:", error);
      alert("메뉴 추가에 실패했습니다.");
    }
  };

  const handleDeleteMenu = async (menuId) => {
    if (!window.confirm('삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'menus', menuId));
    } catch (error) {
      console.error("메뉴 삭제 실패:", error);
      alert("메뉴 삭제에 실패했습니다.");
    }
  };

  const getTabStyle = (tabName) => ({
    padding: '10px 20px',
    backgroundColor: activeTab === tabName ? colors.primary : 'transparent',
    color: activeTab === tabName ? '#000' : colors.text,
    border: `1px solid ${activeTab === tabName ? colors.primary : colors.border}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  });

  // QR 확인된 주문만 매니저 화면/통계/목록에 노출
  const verifiedOrders = orders.filter((order) => order.qrVerified === true);

  const pendingOrders = verifiedOrders.filter((order) => order.status === 'pending');

  const completedOrders = verifiedOrders.filter((order) => order.status === 'completed');

  return (
    <div
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        minHeight: '100vh',
        padding: '20px',
        fontFamily: 'sans-serif',
      }}
    >
      <header
        style={{
          marginBottom: '30px',
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <Logo />
          <h2 style={{ margin: 0, color: colors.primary }}>관리자 대시보드</h2>
        </div>

        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '20px',
          }}
        >
          <h3
            style={{
              margin: '0 0 12px 0',
              color: colors.primary,
            }}
          >
            QR 코드 주문 확인
          </h3>

          <p
            style={{
              margin: '0 0 12px 0',
              color: colors.textDim,
              fontSize: '14px',
            }}
          >
            고객 화면의 QR 코드를 스캔하거나 숫자 6자리 코드를 입력하세요. 확인된 주문만 제조 대기 화면에 표시됩니다.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px',
              gap: '10px',
              marginBottom: qrMessage ? '12px' : '0',
            }}
          >
            <input
              value={qrInput}
              onChange={handleQrInputChange}
              onKeyDown={handleQrKeyDown}
              placeholder="예: 482931"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              style={{
                height: '52px',
                padding: '0 16px',
                backgroundColor: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                fontSize: '22px',
                fontWeight: 'bold',
                letterSpacing: '4px',
                textAlign: 'center',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />

            <button
              onClick={handleVerifyQr}
              disabled={qrChecking}
              style={{
                height: '52px',
                backgroundColor: qrChecking ? colors.border : colors.primary,
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: qrChecking ? 'not-allowed' : 'pointer',
              }}
            >
              {qrChecking ? '확인중' : '확인'}
            </button>
          </div>

          {qrMessage && (
            <div
              style={{
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '12px',
                color: colors.primary,
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              {qrMessage}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('pending')} style={getTabStyle('pending')}>
            제조 대기 ({pendingOrders.length})
          </button>
          <button onClick={() => setActiveTab('completed')} style={getTabStyle('completed')}>
            제조 완료 ({completedOrders.length})
          </button>
          <button onClick={() => setActiveTab('list')} style={getTabStyle('list')}>
            주문 목록
          </button>
          <button onClick={() => setActiveTab('stats')} style={getTabStyle('stats')}>
            상세 통계
          </button>
          <button onClick={() => setActiveTab('menu')} style={getTabStyle('menu')}>
            메뉴 관리
          </button>
        </div>
      </header>

      <div>
        {activeTab === 'pending' && (
          <div>
            <h3 style={{ color: colors.primary, marginBottom: '20px' }}>
              제조 대기 중인 주문
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {pendingOrders.length === 0 ? (
                <p style={{ color: colors.textDim }}>대기 중인 주문이 없습니다.</p>
              ) : (
                pendingOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      backgroundColor: '#1A1A1A',
                      border: `2px solid ${colors.primary}`,
                      borderRadius: '12px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: `1px solid ${colors.border}`,
                        paddingBottom: '10px',
                        marginBottom: '10px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                          {formatPhone(order.phone)}
                        </div>

                        <div
                          style={{
                            marginTop: '4px',
                            color: colors.primary,
                            fontSize: '14px',
                            fontWeight: 'bold',
                          }}
                        >
                          주문코드: {order.qrCode || String(order.id).slice(-4).toUpperCase()}
                        </div>
                      </div>

                      <span
                        style={{
                          backgroundColor: colors.danger,
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '14px',
                          height: 'fit-content',
                        }}
                      >
                        대기 중
                      </span>
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      {Array.isArray(order.items) && order.items.length > 0 ? (
                        order.items.map((item, idx) => (
                          <div
                            key={idx}
                            style={{
                              color: colors.text,
                              marginBottom: '8px',
                            }}
                          >
                            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                              - {item.name} ({item.quantity}개)
                            </div>

                            {(item.selectedHotIce || item.selectedShot) && (
                              <div
                                style={{
                                  fontSize: '14px',
                                  color: colors.textDim,
                                  marginLeft: '15px',
                                  marginTop: '4px',
                                }}
                              >
                                {item.selectedHotIce && <span>[{item.selectedHotIce}] </span>}
                                {item.selectedShot && <span>[샷 추가]</span>}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p style={{ color: colors.textDim }}>메뉴 정보 없음</p>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        marginTop: '20px',
                        paddingTop: '15px',
                        borderTop: `1px solid ${colors.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '5px',
                        }}
                      >
                        <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
                          총 {Number(order.totalPrice || 0).toLocaleString()}원
                        </span>

                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: order.paymentStatus === 'completed' ? colors.success : colors.danger,
                          }}
                        >
                          {order.paymentStatus === 'completed' ? '✅ QR/결제 완료됨' : '⏳ 결제 확인 필요'}
                        </span>
                      </div>

                      <button
                        onClick={() => handlePaymentComplete(order)}
                        style={{
                          backgroundColor: order.paymentStatus === 'completed' ? colors.surface : colors.success,
                          color: order.paymentStatus === 'completed' ? colors.textDim : '#fff',
                          border: `1px solid ${colors.border}`,
                          padding: '12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: order.paymentStatus === 'completed' ? 'not-allowed' : 'pointer',
                          fontSize: '16px',
                        }}
                        disabled={order.paymentStatus === 'completed'}
                      >
                        {order.paymentStatus === 'completed' ? '결제 완료됨' : '담당자 결제완료'}
                      </button>

                      <button
                        onClick={() => handlePrint(order, 'order')}
                        style={{
                          backgroundColor: 'transparent',
                          color: colors.primary,
                          border: `1px solid ${colors.primary}`,
                          padding: '12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '16px',
                        }}
                      >
                        주문서 재출력 (주방용)
                      </button>

                      <button
                        onClick={() => handlePrint(order, 'receipt')}
                        style={{
                          backgroundColor: 'transparent',
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          padding: '12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '16px',
                        }}
                      >
                        영수증 프린트 (고객용)
                      </button>

                      <button
                        onClick={() => handleComplete(order.id)}
                        style={{
                          backgroundColor: colors.primary,
                          color: '#000',
                          border: 'none',
                          padding: '12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          fontSize: '16px',
                          marginTop: '10px',
                        }}
                      >
                        조리 완료
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'completed' && (
          <div>
            <h3 style={{ color: colors.success, marginBottom: '20px' }}>
              제조 완료된 주문
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {completedOrders.length === 0 ? (
                <p style={{ color: colors.textDim }}>완료된 주문이 없습니다.</p>
              ) : (
                completedOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      backgroundColor: colors.surface,
                      border: `1px solid ${colors.border}`,
                      opacity: 0.7,
                      borderRadius: '12px',
                      padding: '20px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: `1px solid ${colors.border}`,
                        paddingBottom: '10px',
                        marginBottom: '10px',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: colors.textDim,
                          }}
                        >
                          {formatPhone(order.phone)}
                        </span>

                        <div
                          style={{
                            marginTop: '4px',
                            color: colors.primary,
                            fontSize: '14px',
                            fontWeight: 'bold',
                          }}
                        >
                          주문코드: {order.qrCode || String(order.id).slice(-4).toUpperCase()}
                        </div>
                      </div>

                      <span
                        style={{
                          backgroundColor: colors.success,
                          color: '#fff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '14px',
                          height: 'fit-content',
                        }}
                      >
                        완료됨
                      </span>
                    </div>

                    {Array.isArray(order.items) && order.items.length > 0 ? (
                      order.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            color: colors.textDim,
                            marginBottom: '5px',
                          }}
                        >
                          - {item.name} ({item.quantity}개)
                        </div>
                      ))
                    ) : (
                      <p style={{ color: colors.textDim }}>메뉴 정보 없음</p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '15px',
                        paddingTop: '15px',
                        borderTop: `1px solid ${colors.border}`,
                      }}
                    >
                      <button
                        onClick={() => handlePrint(order, 'receipt')}
                        style={{
                          backgroundColor: 'transparent',
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          padding: '10px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                        }}
                      >
                        영수증 재출력
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div>
            <h3 style={{ marginBottom: '20px' }}>전체 주문 내역</h3>

            <div
              style={{
                backgroundColor: colors.surface,
                borderRadius: '12px',
                padding: '20px',
                border: `1px solid ${colors.border}`,
              }}
            >
              {verifiedOrders.length === 0 ? (
                <p style={{ color: colors.textDim }}>주문 내역이 없습니다.</p>
              ) : (
                verifiedOrders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.1fr 1.2fr 1fr 1fr',
                      gap: '10px',
                      padding: '10px 0',
                      borderBottom: `1px solid ${colors.border}`,
                      alignItems: 'center',
                    }}
                  >
                    <span>{order.date || ''} {order.time || ''}</span>
                    <span>{order.qrCode || String(order.id).slice(-4).toUpperCase()}</span>
                    <span>{formatPhone(order.phone)}</span>
                    <span>
                      {order.status === 'pending'
                        ? '대기 중'
                        : order.status === 'completed'
                          ? '완료됨'
                          : order.status || '상태 없음'}
                    </span>
                    <span>{Number(order.totalPrice || 0).toLocaleString()}원</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <Statistics orders={verifiedOrders} menus={menus} />
        )}

        {activeTab === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div
              style={{
                backgroundColor: colors.surface,
                padding: '20px',
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <h3 style={{ marginBottom: '15px', color: colors.primary }}>
                1. 카테고리 관리
              </h3>

              <form
                onSubmit={handleAddCategory}
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '15px',
                }}
              >
                <input
                  type="text"
                  placeholder="새 카테고리명 입력"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: colors.bg,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                  }}
                />

                <button
                  type="submit"
                  style={{
                    backgroundColor: colors.secondary,
                    color: '#000',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  카테고리 추가
                </button>
              </form>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: colors.bg,
                      padding: '8px 12px',
                      borderRadius: '20px',
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <span>{cat.name}</span>

                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.danger,
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '0',
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                backgroundColor: colors.surface,
                padding: '20px',
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <h3 style={{ marginBottom: '15px', color: colors.primary }}>
                2. 새 메뉴 추가
              </h3>

              <form
                onSubmit={handleAddMenu}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '15px',
                }}
              >
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={newMenuCategory}
                    onChange={(e) => setNewMenuCategory(e.target.value)}
                    style={{
                      padding: '10px',
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                      width: '150px',
                    }}
                  >
                    {categories.length === 0 ? (
                      <option value="">카테고리 없음</option>
                    ) : (
                      categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))
                    )}
                  </select>

                  <input
                    type="text"
                    placeholder="메뉴명"
                    value={newMenuName}
                    onChange={(e) => setNewMenuName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                    }}
                  />

                  <input
                    type="number"
                    placeholder="기본 가격"
                    value={newMenuPrice}
                    onChange={(e) => setNewMenuPrice(e.target.value)}
                    style={{
                      width: '150px',
                      padding: '10px',
                      backgroundColor: colors.bg,
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                    }}
                  />
                </div>

                <div
                  style={{
                    backgroundColor: colors.bg,
                    padding: '15px',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={useHotIce}
                        onChange={(e) => setUseHotIce(e.target.checked)}
                      />
                      HOT / ICE 옵션 사용
                    </label>

                    {useHotIce && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="HOT 추가금액"
                          value={hotPrice}
                          onChange={(e) => setHotPrice(e.target.value)}
                          style={{
                            width: '120px',
                            padding: '6px',
                            backgroundColor: colors.surface,
                            color: colors.text,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '4px',
                          }}
                        />
                        원

                        <input
                          type="number"
                          placeholder="ICE 추가금액"
                          value={icePrice}
                          onChange={(e) => setIcePrice(e.target.value)}
                          style={{
                            width: '120px',
                            padding: '6px',
                            backgroundColor: colors.surface,
                            color: colors.text,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '4px',
                          }}
                        />
                        원
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={useShot}
                        onChange={(e) => setUseShot(e.target.checked)}
                      />
                      샷 추가 옵션 사용
                    </label>

                    {useShot && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="number"
                          placeholder="샷 추가금액"
                          value={shotPrice}
                          onChange={(e) => setShotPrice(e.target.value)}
                          style={{
                            width: '120px',
                            padding: '6px',
                            backgroundColor: colors.surface,
                            color: colors.text,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '4px',
                          }}
                        />
                        원
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  style={{
                    backgroundColor: colors.primary,
                    color: '#000',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '16px',
                  }}
                >
                  메뉴 등록하기
                </button>
              </form>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}
            >
              {categories.map((cat) => {
                const categoryMenus = menus.filter((menu) => menu.category === cat.name);

                if (categoryMenus.length === 0) {
                  return null;
                }
                
                return (
                  <div
                    key={cat.id}
                    style={{
                      backgroundColor: colors.surface,
                      padding: '15px',
                      borderRadius: '8px',
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    <h4
                      style={{
                        color: colors.primary,
                        fontSize: '20px',
                        margin: '0 0 15px 0',
                        paddingBottom: '10px',
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      {cat.name}
                    </h4>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '15px',
                      }}
                    >
                      {categoryMenus.map((menu) => (
                        <div
                          key={menu.id}
                          style={{
                            backgroundColor: colors.bg,
                            padding: '12px',
                            borderRadius: '6px',
                            border: `1px solid ${colors.border}`,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '8px',
                            }}
                          >
                            <span
                              style={{
                                color: colors.text,
                                fontWeight: 'bold',
                                fontSize: '16px',
                              }}
                            >
                              {menu.name}
                            </span>

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                              }}
                            >
                              <span style={{ color: colors.textDim }}>
                                {Number(menu.price || 0).toLocaleString()}원
                              </span>

                              <button
                                onClick={() => handleDeleteMenu(menu.id)}
                                style={{
                                  backgroundColor: 'transparent',
                                  color: colors.danger,
                                  border: `1px solid ${colors.danger}`,
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          {menu.options && (
                            <div style={{ fontSize: '13px', color: colors.textDim }}>
                              {menu.options.useHotIce && (
                                <div>
                                  └ HOT: +{menu.options.hotPrice}원 / ICE: +{menu.options.icePrice}원
                                </div>
                              )}

                              {menu.options.useShot && (
                                <div>
                                  └ 샷 추가: +{menu.options.shotPrice}원
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
