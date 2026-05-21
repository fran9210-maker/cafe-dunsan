import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  orderBy,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  increment
} from 'firebase/firestore';
import { colors, Logo } from '../utils/theme';

export default function CustomerApp() {
  const [appStep, setAppStep] = useState('phone');

  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [phone, setPhone] = useState('');

  const [currentPoints, setCurrentPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(0);

  const [selectedMenu, setSelectedMenu] = useState(null);
  const [optionHotIce, setOptionHotIce] = useState('HOT');
  const [optionShot, setOptionShot] = useState(false);

  const [placedOrder, setPlacedOrder] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      setCategories(cats);

      if (cats.length > 0) {
        setSelectedCategory(prev => prev || cats[0].name);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'menus'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMenus(snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      })));
    });

    return () => unsubscribe();
  }, []);

  const formatPhone = (value) => {
    if (!value) return '';

    const onlyNumber = String(value).replace(/[^0-9]/g, '');

    if (onlyNumber.length === 11) {
      return onlyNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }

    if (onlyNumber.length === 10) {
      return onlyNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }

    return onlyNumber;
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
    setPhone(value);
  };

  const handleStartOrder = async () => {
    if (phone.length < 10) {
      alert('정확한 전화번호를 입력해주세요.');
      return;
    }

    try {
      const customerRef = doc(db, 'customers', phone);
      const customerSnap = await getDoc(customerRef);

      if (customerSnap.exists()) {
        setCurrentPoints(Number(customerSnap.data().points || 0));
      } else {
        setCurrentPoints(0);
      }
    } catch (error) {
      console.error('포인트 조회 실패:', error);
      setCurrentPoints(0);
    }

    setUsePoints(0);
    setAppStep('menu');
  };

  const handleMenuClick = (menu) => {
    const hasOptions = menu.options && (menu.options.useHotIce || menu.options.useShot);

    if (hasOptions) {
      setSelectedMenu(menu);
      setOptionHotIce('HOT');
      setOptionShot(false);
    } else {
      addToCart(menu, null, false, Number(menu.price || 0));
    }
  };

  const addToCart = (menu, hotIce, shot, finalPrice) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(
        item =>
          item.id === menu.id &&
          item.selectedHotIce === hotIce &&
          item.selectedShot === shot
      );

      if (existingItem) {
        return prevCart.map(item =>
          item.id === menu.id &&
          item.selectedHotIce === hotIce &&
          item.selectedShot === shot
            ? {
                ...item,
                quantity: Number(item.quantity || 0) + 1
              }
            : item
        );
      }

      return [
        ...prevCart,
        {
          id: menu.id,
          name: menu.name,
          basePrice: Number(menu.price || 0),
          finalPrice: Number(finalPrice || 0),
          selectedHotIce: hotIce,
          selectedShot: shot,
          quantity: 1
        }
      ];
    });

    setSelectedMenu(null);
  };

  const updateCartQuantity = (index, value) => {
    const quantity = Number(value);

    if (Number.isNaN(quantity)) return;

    if (quantity <= 0) {
      setCart(prevCart => prevCart.filter((_, i) => i !== index));
      return;
    }

    setCart(prevCart =>
      prevCart.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity
            }
          : item
      )
    );
  };

  const increaseCartQuantity = (index) => {
    setCart(prevCart =>
      prevCart.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity: Number(item.quantity || 0) + 1
            }
          : item
      )
    );
  };

  const decreaseCartQuantity = (index) => {
    setCart(prevCart =>
      prevCart
        .map((item, i) =>
          i === index
            ? {
                ...item,
                quantity: Number(item.quantity || 0) - 1
              }
            : item
        )
        .filter(item => Number(item.quantity) > 0)
    );
  };

  const removeCartItem = (index) => {
    setCart(prevCart => prevCart.filter((_, i) => i !== index));
  };

  const handleConfirmOption = () => {
    if (!selectedMenu) return;

    let finalPrice = Number(selectedMenu.price || 0);
    let hotIceSelection = null;
    let shotSelection = false;

    if (selectedMenu.options?.useHotIce) {
      hotIceSelection = optionHotIce;

      if (optionHotIce === 'HOT') {
        finalPrice += Number(selectedMenu.options.hotPrice || 0);
      } else {
        finalPrice += Number(selectedMenu.options.icePrice || 0);
      }
    }

    if (selectedMenu.options?.useShot && optionShot) {
      shotSelection = true;
      finalPrice += Number(selectedMenu.options.shotPrice || 0);
    }

    addToCart(selectedMenu, hotIceSelection, shotSelection, finalPrice);
  };

  // ==========================================
  // 포인트 / 결제 금액 계산
  // ==========================================

  const cartSubtotal = cart.reduce(
    (sum, item) => sum + Number(item.finalPrice || 0) * Number(item.quantity || 0),
    0
  );

  const maxUsablePoints = Math.min(
    Number(currentPoints || 0),
    Math.floor(cartSubtotal * 0.05)
  );

  const safeUsePoints = Math.min(
    Number(usePoints || 0),
    maxUsablePoints
  );

  const cartTotal = Math.max(cartSubtotal - safeUsePoints, 0);

  const expectedPoints = Math.floor(cartTotal * 0.05);

  useEffect(() => {
    const numericUsePoints = Number(usePoints || 0);

    if (numericUsePoints > maxUsablePoints) {
      setUsePoints(maxUsablePoints);
    }
  }, [usePoints, maxUsablePoints]);

  const handleUsePointsChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    const nextPoints = Number(value || 0);

    if (nextPoints > maxUsablePoints) {
      setUsePoints(maxUsablePoints);
      return;
    }

    setUsePoints(nextPoints);
  };

  const useMaxPoints = () => {
    setUsePoints(maxUsablePoints);
  };

  const clearUsePoints = () => {
    setUsePoints(0);
  };

  const handleOrder = async () => {
    if (cart.length === 0) {
      alert('장바구니가 비어있습니다.');
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const normalizedCart = cart.map(item => ({
      ...item,
      basePrice: Number(item.basePrice || 0),
      finalPrice: Number(item.finalPrice || 0),
      quantity: Number(item.quantity || 1)
    }));

    const subtotalPrice = normalizedCart.reduce(
      (sum, item) => sum + Number(item.finalPrice || 0) * Number(item.quantity || 0),
      0
    );

    const maxPointsForThisOrder = Math.min(
      Number(currentPoints || 0),
      Math.floor(subtotalPrice * 0.05)
    );

    const usedPoints = Math.min(
      Number(usePoints || 0),
      maxPointsForThisOrder
    );

    const finalPaymentPrice = Math.max(subtotalPrice - usedPoints, 0);

    const earnedPoints = Math.floor(finalPaymentPrice * 0.05);

    try {
      const orderRef = await addDoc(collection(db, 'orders'), {
        phone,
        items: normalizedCart,
        subtotalPrice,
        usedPoints,
        totalPrice: finalPaymentPrice,
        earnedPoints,
        status: 'pending',
        paymentStatus: 'pending',
        date: dateStr,
        time: timeStr,
        createdAt: Date.now()
      });

      const customerRef = doc(db, 'customers', phone);

      await setDoc(customerRef, {
        phone,
        points: increment(earnedPoints - usedPoints),
        totalEarnedPoints: increment(earnedPoints),
        totalUsedPoints: increment(usedPoints)
      }, { merge: true });

      setPlacedOrder({
        id: orderRef.id,
        subtotalPrice,
        usedPoints,
        totalPrice: finalPaymentPrice,
        earnedPoints,
        totalPoints: Number(currentPoints || 0) - usedPoints + earnedPoints
      });

      setAppStep('complete');
    } catch (error) {
      console.error('주문 실패:', error);
      alert('주문 중 오류가 발생했습니다.');
    }
  };

  const handleEditOrder = async () => {
    if (!placedOrder) return;

    try {
      await deleteDoc(doc(db, 'orders', placedOrder.id));

      const customerRef = doc(db, 'customers', phone);

      const usedPoints = Number(placedOrder.usedPoints || 0);
      const earnedPoints = Number(placedOrder.earnedPoints || 0);

      await setDoc(customerRef, {
        points: increment(usedPoints - earnedPoints),
        totalEarnedPoints: increment(-earnedPoints),
        totalUsedPoints: increment(-usedPoints)
      }, { merge: true });

      setCurrentPoints(prev => Number(prev || 0) + usedPoints - earnedPoints);
      setPlacedOrder(null);
      setUsePoints(0);
      setAppStep('menu');
    } catch (error) {
      console.error('주문 취소 실패:', error);
      alert('주문 수정 중 오류가 발생했습니다.');
    }
  };

  const handleReset = () => {
    setCart([]);
    setPhone('');
    setCurrentPoints(0);
    setUsePoints(0);
    setPlacedOrder(null);
    setSelectedMenu(null);
    setAppStep('phone');
  };

  const currentCategoryMenus = menus.filter(menu => menu.category === selectedCategory);

  const getModalPreviewPrice = () => {
    if (!selectedMenu) return 0;

    let price = Number(selectedMenu.price || 0);

    if (selectedMenu.options?.useHotIce) {
      price += optionHotIce === 'HOT'
        ? Number(selectedMenu.options.hotPrice || 0)
        : Number(selectedMenu.options.icePrice || 0);
    }

    if (selectedMenu.options?.useShot && optionShot) {
      price += Number(selectedMenu.options.shotPrice || 0);
    }

    return price;
  };

  // ==========================================
  // 1. 전화번호 입력 화면
  // ==========================================
  if (appStep === 'phone') {
    return (
      <div
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'sans-serif'
        }}
      >
        <Logo />

        <div
          style={{
            marginTop: '50px',
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          <h3 style={{ textAlign: 'center', color: colors.primary, margin: 0 }}>
            전화번호를 입력해주세요
          </h3>

          <p
            style={{
              textAlign: 'center',
              color: colors.textDim,
              margin: '0 0 10px 0',
              fontSize: '14px'
            }}
          >
            주문하신 메뉴가 준비되면 알려드립니다.
          </p>

          <input
            type="text"
            placeholder="숫자만 입력 (예: 01012345678)"
            value={phone}
            onChange={handlePhoneChange}
            style={{
              width: '100%',
              height: '60px',
              padding: '0 20px',
              backgroundColor: colors.surface,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              fontSize: '20px',
              textAlign: 'center',
              boxSizing: 'border-box',
              letterSpacing: '2px'
            }}
          />

          <button
            onClick={handleStartOrder}
            style={{
              width: '100%',
              height: '60px',
              backgroundColor: colors.primary,
              color: '#000',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 'bold',
              fontSize: '20px',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            주문 시작하기
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. 주문 완료 화면
  // ==========================================
  if (appStep === 'complete' && placedOrder) {
    return (
      <div
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          fontFamily: 'sans-serif'
        }}
      >
        <Logo />

        <div
          style={{
            backgroundColor: colors.surface,
            padding: '40px',
            borderRadius: '16px',
            border: `1px solid ${colors.border}`,
            textAlign: 'center',
            marginTop: '30px',
            width: '100%',
            maxWidth: '430px',
            boxSizing: 'border-box'
          }}
        >
          <h2 style={{ color: colors.primary, marginBottom: '20px' }}>
            주문이 완료되었습니다!
          </h2>

          <p style={{ color: colors.textDim, marginBottom: '30px' }}>
            아래 QR 코드를 스캔하여 결제를 진행해주세요.
          </p>

          <div
            style={{
              backgroundColor: '#fff',
              padding: '15px',
              borderRadius: '12px',
              display: 'inline-block',
              marginBottom: '30px'
            }}
          >
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${placedOrder.id}`}
              alt="결제 QR 코드"
              style={{ display: 'block' }}
            />
          </div>

          <div
            style={{
              backgroundColor: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '12px',
              padding: '15px',
              marginBottom: '25px',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                color: colors.textDim
              }}
            >
              <span>상품 합계</span>
              <strong style={{ color: colors.text }}>
                {Number(placedOrder.subtotalPrice || 0).toLocaleString()}원
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                color: colors.textDim
              }}
            >
              <span>포인트 사용</span>
              <strong style={{ color: colors.danger }}>
                -{Number(placedOrder.usedPoints || 0).toLocaleString()}원
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: `1px solid ${colors.border}`,
                fontSize: '20px',
                fontWeight: 'bold'
              }}
            >
              <span>최종 결제 금액</span>
              <span style={{ color: colors.primary }}>
                {Number(placedOrder.totalPrice || 0).toLocaleString()}원
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: '16px',
              color: colors.primary,
              marginBottom: '35px',
              fontWeight: 'bold',
              lineHeight: '1.6'
            }}
          >
            🎉 {Number(placedOrder.earnedPoints || 0).toLocaleString()} P 적립 예정
            <br />
            주문 후 예상 잔여 포인트:{' '}
            {Number(placedOrder.totalPoints || 0).toLocaleString()} P
          </div>

          <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
            <button
              onClick={handleEditOrder}
              style={{
                padding: '15px',
                backgroundColor: 'transparent',
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              주문 수정하기
            </button>

            <button
              onClick={handleReset}
              style={{
                padding: '15px',
                backgroundColor: colors.primary,
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              처음으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. 메뉴 선택 화면
  // ==========================================
  return (
    <div
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 위쪽 메뉴판 영역: 별도 스크롤 */}
      <div
        style={{
          flex: 1,
          padding: '18px 20px',
          overflowY: 'auto',
          minHeight: 0
        }}
      >
        <header style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Logo />
        </header>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '10px',
            marginBottom: '18px'
          }}
        >
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              style={{
                padding: '10px 20px',
                backgroundColor: selectedCategory === cat.name ? colors.primary : 'transparent',
                color: selectedCategory === cat.name ? '#000' : colors.text,
                border: `1px solid ${selectedCategory === cat.name ? colors.primary : colors.border}`,
                borderRadius: '20px',
                whiteSpace: 'nowrap',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '15px',
            paddingBottom: '20px'
          }}
        >
          {currentCategoryMenus.length === 0 ? (
            <div
              style={{
                color: colors.textDim,
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '40px 0'
              }}
            >
              등록된 메뉴가 없습니다.
            </div>
          ) : (
            currentCategoryMenus.map(menu => (
              <div
                key={menu.id}
                onClick={() => handleMenuClick(menu)}
                style={{
                  backgroundColor: colors.surface,
                  padding: '15px',
                  borderRadius: '12px',
                  border: `1px solid ${colors.border}`,
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    marginBottom: '10px'
                  }}
                >
                  {menu.name}
                </div>

                <div style={{ color: colors.primary, fontWeight: 'bold' }}>
                  {Number(menu.price || 0).toLocaleString()}원
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 옵션 선택 모달 */}
      {selectedMenu && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              padding: '25px',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '400px',
              border: `1px solid ${colors.border}`,
              boxSizing: 'border-box'
            }}
          >
            <h2
              style={{
                margin: '0 0 20px 0',
                color: colors.primary,
                textAlign: 'center'
              }}
            >
              {selectedMenu.name}
            </h2>

            {selectedMenu.options?.useHotIce && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: colors.textDim }}>
                  온도 선택
                </h4>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setOptionHotIce('HOT')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      border: `1px solid ${optionHotIce === 'HOT' ? colors.danger : colors.border}`,
                      backgroundColor: optionHotIce === 'HOT' ? 'rgba(255, 71, 87, 0.2)' : 'transparent',
                      color: optionHotIce === 'HOT' ? colors.danger : colors.text,
                      cursor: 'pointer'
                    }}
                  >
                    HOT (+{Number(selectedMenu.options.hotPrice || 0).toLocaleString()}원)
                  </button>

                  <button
                    onClick={() => setOptionHotIce('ICE')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      border: `1px solid ${optionHotIce === 'ICE' ? '#74b9ff' : colors.border}`,
                      backgroundColor: optionHotIce === 'ICE' ? 'rgba(116, 185, 255, 0.2)' : 'transparent',
                      color: optionHotIce === 'ICE' ? '#74b9ff' : colors.text,
                      cursor: 'pointer'
                    }}
                  >
                    ICE (+{Number(selectedMenu.options.icePrice || 0).toLocaleString()}원)
                  </button>
                </div>
              </div>
            )}

            {selectedMenu.options?.useShot && (
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: colors.textDim }}>
                  추가 옵션
                </h4>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    border: `1px solid ${optionShot ? colors.primary : colors.border}`,
                    borderRadius: '8px',
                    backgroundColor: optionShot ? 'rgba(162, 155, 254, 0.1)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={optionShot}
                    onChange={(e) => setOptionShot(e.target.checked)}
                    style={{ width: '20px', height: '20px' }}
                  />

                  <span style={{ flex: 1 }}>샷 추가</span>

                  <span style={{ color: colors.primary }}>
                    +{Number(selectedMenu.options.shotPrice || 0).toLocaleString()}원
                  </span>
                </label>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: `1px solid ${colors.border}`
              }}
            >
              <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {getModalPreviewPrice().toLocaleString()}원
              </span>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setSelectedMenu(null)}
                  style={{
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    backgroundColor: 'transparent',
                    color: colors.text,
                    cursor: 'pointer'
                  }}
                >
                  취소
                </button>

                <button
                  onClick={handleConfirmOption}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: colors.primary,
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  담기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 하단 장바구니 및 결제 영역: 화면의 최대 48%만 사용 */}
      <div
        style={{
          backgroundColor: colors.surface,
          padding: '12px 18px',
          borderTop: `1px solid ${colors.border}`,
          zIndex: 100,
          boxSizing: 'border-box',
          width: '100%',
          maxHeight: '48vh',
          overflowY: 'auto',
          flexShrink: 0
        }}
      >
        {/* 주문표 */}
        <div
          style={{
            maxHeight: '150px',
            minHeight: cart.length > 0 ? '90px' : '60px',
            overflowY: 'auto',
            marginBottom: '10px',
            paddingRight: '4px'
          }}
        >
          {cart.length === 0 ? (
            <div
              style={{
                color: colors.textDim,
                textAlign: 'center',
                padding: '20px 0'
              }}
            >
              장바구니가 비어있습니다.
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={`${item.id}-${item.selectedHotIce || 'none'}-${item.selectedShot ? 'shot' : 'noshot'}-${idx}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '8px',
                  alignItems: 'center',
                  marginBottom: '7px',
                  padding: '8px 9px',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '10px',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 'bold',
                      fontSize: '14px',
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {item.name}
                  </div>

                  <div
                    style={{
                      fontSize: '11px',
                      color: colors.textDim,
                      minHeight: '13px'
                    }}
                  >
                    {item.selectedHotIce && `[${item.selectedHotIce}] `}
                    {item.selectedShot && '[샷 추가]'}
                  </div>

                  <div
                    style={{
                      marginTop: '3px',
                      fontSize: '13px',
                      color: colors.primary,
                      fontWeight: 'bold'
                    }}
                  >
                    {(Number(item.finalPrice || 0) * Number(item.quantity || 0)).toLocaleString()}원
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <button
                    onClick={() => decreaseCartQuantity(idx)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                      color: colors.text,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '17px',
                      lineHeight: '1'
                    }}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateCartQuantity(idx, e.target.value)}
                    style={{
                      width: '48px',
                      height: '30px',
                      textAlign: 'center',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                      color: colors.text,
                      fontWeight: 'bold',
                      boxSizing: 'border-box'
                    }}
                  />

                  <button
                    onClick={() => increaseCartQuantity(idx)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`,
                      backgroundColor: colors.surface,
                      color: colors.text,
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      fontSize: '17px',
                      lineHeight: '1'
                    }}
                  >
                    +
                  </button>

                  <button
                    onClick={() => removeCartItem(idx)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      border: `1px solid ${colors.danger}`,
                      backgroundColor: 'transparent',
                      color: colors.danger,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    X
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 포인트 사용 및 결제 정보 */}
        <div
          style={{
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '10px',
            padding: '10px',
            marginBottom: '10px'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px 12px',
              marginBottom: '10px',
              fontSize: '13px',
              color: colors.textDim
            }}
          >
            <div>
              상품 합계:{' '}
              <strong style={{ color: colors.text }}>
                {cartSubtotal.toLocaleString()}원
              </strong>
            </div>

            <div>
              보유 포인트:{' '}
              <strong style={{ color: colors.primary }}>
                {Number(currentPoints || 0).toLocaleString()} P
              </strong>
            </div>

            <div>
              사용 가능:{' '}
              <strong style={{ color: colors.primary }}>
                {maxUsablePoints.toLocaleString()} P
              </strong>
            </div>

            <div>
              적립 예정:{' '}
              <strong style={{ color: colors.primary }}>
                {expectedPoints.toLocaleString()} P
              </strong>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '8px',
              marginBottom: '8px'
            }}
          >
            <input
              type="text"
              value={usePoints}
              onChange={handleUsePointsChange}
              disabled={maxUsablePoints <= 0}
              placeholder="사용할 포인트"
              style={{
                height: '36px',
                padding: '0 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface,
                color: colors.text,
                boxSizing: 'border-box',
                fontWeight: 'bold'
              }}
            />

            <button
              onClick={useMaxPoints}
              disabled={maxUsablePoints <= 0}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: maxUsablePoints <= 0 ? colors.border : colors.primary,
                color: '#000',
                fontWeight: 'bold',
                cursor: maxUsablePoints <= 0 ? 'not-allowed' : 'pointer'
              }}
            >
              최대
            </button>

            <button
              onClick={clearUsePoints}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '6px',
                border: `1px solid ${colors.border}`,
                backgroundColor: 'transparent',
                color: colors.text,
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              초기화
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: colors.textDim,
              marginBottom: '6px'
            }}
          >
            <span>포인트 할인</span>
            <strong style={{ color: colors.danger }}>
              -{safeUsePoints.toLocaleString()}원
            </strong>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '15px',
              color: colors.textDim,
              borderTop: `1px solid ${colors.border}`,
              paddingTop: '8px'
            }}
          >
            <span>최종 결제 금액</span>
            <strong style={{ color: colors.primary, fontSize: '18px' }}>
              {cartTotal.toLocaleString()}원
            </strong>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div
            style={{
              height: '50px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg,
              color: colors.textDim,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 'bold',
              boxSizing: 'border-box',
              letterSpacing: '0.5px'
            }}
          >
            {formatPhone(phone)}
          </div>

          <button
            onClick={handleOrder}
            style={{
              height: '50px',
              backgroundColor: colors.primary,
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '17px',
              cursor: 'pointer',
              boxSizing: 'border-box'
            }}
          >
            {cartTotal.toLocaleString()}원 결제
          </button>
        </div>
      </div>
    </div>
  );
}
