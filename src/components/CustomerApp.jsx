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

  const createQrCode = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
  };

  const handleOrder = async () => {
    if (cart.length === 0) {
      alert('장바구니가 비어있습니다.');
      return;
    }

    const now = new Date();
    const nowTime = Date.now();

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

    const qrCode = createQrCode();

    try {
      const orderRef = await addDoc(collection(db, 'orders'), {
        phone,
        items: normalizedCart,
        subtotalPrice,
        usedPoints,
        totalPrice: finalPaymentPrice,
        earnedPoints,

        qrCode,

        status: 'pending',
        paymentStatus: 'pending',

        qrVerified: false,
        qrVerifiedAt: null,

        paidAt: null,
        displayHidden: false,

        date: dateStr,
        time: timeStr,
        createdAt: nowTime,
        updatedAt: nowTime
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
        qrCode,
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

  if (appStep === 'phone') {
    return (
      <div style={styles.centerPage}>
        <Logo />

        <div style={styles.phoneBox}>
          <h3 style={styles.title}>전화번호를 입력해주세요</h3>

          <p style={styles.description}>
            주문하신 메뉴가 준비되면 알려드립니다.
          </p>

          <input
            type="text"
            placeholder="숫자만 입력 (예: 01012345678)"
            value={phone}
            onChange={handlePhoneChange}
            style={styles.phoneInput}
          />

          <button onClick={handleStartOrder} style={styles.primaryButton}>
            주문 시작하기
          </button>
        </div>
      </div>
    );
  }

  if (appStep === 'complete' && placedOrder) {
    return (
      <div style={styles.centerPage}>
        <Logo />

        <div style={styles.completeBox}>
          <h2 style={styles.completeTitle}>
            주문이 완료되었습니다!
          </h2>

          <p style={styles.description}>
            아래 QR 코드를 매니저에게 보여주세요.
            <br />
            QR 확인 후 주문서가 접수됩니다.
          </p>

          <div style={styles.qrBox}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(placedOrder.qrCode)}`}
              alt="주문 확인 QR 코드"
              style={{ display: 'block' }}
            />
          </div>

          <div style={styles.qrCodeText}>
            QR 확인 코드
            <strong>{placedOrder.qrCode}</strong>
          </div>

          <div style={styles.priceSummary}>
            <SummaryRow
              label="상품 합계"
              value={`${Number(placedOrder.subtotalPrice || 0).toLocaleString()}원`}
            />

            <SummaryRow
              label="포인트 사용"
              value={`-${Number(placedOrder.usedPoints || 0).toLocaleString()}원`}
              danger
            />

            <div style={styles.totalRow}>
              <span>최종 결제 금액</span>
              <strong>
                {Number(placedOrder.totalPrice || 0).toLocaleString()}원
              </strong>
            </div>
          </div>

          <div style={styles.pointNotice}>
            🎉 {Number(placedOrder.earnedPoints || 0).toLocaleString()} P 적립 예정
            <br />
            주문 후 예상 잔여 포인트:{' '}
            {Number(placedOrder.totalPoints || 0).toLocaleString()} P
          </div>

          <div style={styles.completeButtonGroup}>
            <button onClick={handleEditOrder} style={styles.secondaryButton}>
              주문 수정하기
            </button>

            <button onClick={handleReset} style={styles.primaryButton}>
              처음으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.orderPage}>
      <div style={styles.menuArea}>
        <header style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Logo />
        </header>

        <div style={styles.categoryRow}>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.name)}
              style={{
                ...styles.categoryButton,
                backgroundColor: selectedCategory === cat.name ? colors.primary : 'transparent',
                color: selectedCategory === cat.name ? '#000' : colors.text,
                border: `1px solid ${selectedCategory === cat.name ? colors.primary : colors.border}`
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div style={styles.menuGrid}>
          {currentCategoryMenus.length === 0 ? (
            <div style={styles.emptyMenu}>
              등록된 메뉴가 없습니다.
            </div>
          ) : (
            currentCategoryMenus.map(menu => (
              <div
                key={menu.id}
                onClick={() => handleMenuClick(menu)}
                style={styles.menuCard}
              >
                <div style={styles.menuName}>
                  {menu.name}
                </div>

                <div style={styles.menuPrice}>
                  {Number(menu.price || 0).toLocaleString()}원
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedMenu && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <h2 style={styles.modalTitle}>
              {selectedMenu.name}
            </h2>

            {selectedMenu.options?.useHotIce && (
              <div style={styles.optionBlock}>
                <h4 style={styles.optionTitle}>온도 선택</h4>

                <div style={styles.optionRow}>
                  <button
                    onClick={() => setOptionHotIce('HOT')}
                    style={{
                      ...styles.optionButton,
                      border: `1px solid ${optionHotIce === 'HOT' ? colors.danger : colors.border}`,
                      backgroundColor: optionHotIce === 'HOT' ? 'rgba(255, 71, 87, 0.2)' : 'transparent',
                      color: optionHotIce === 'HOT' ? colors.danger : colors.text
                    }}
                  >
                    HOT (+{Number(selectedMenu.options.hotPrice || 0).toLocaleString()}원)
                  </button>

                  <button
                    onClick={() => setOptionHotIce('ICE')}
                    style={{
                      ...styles.optionButton,
                      border: `1px solid ${optionHotIce === 'ICE' ? '#74b9ff' : colors.border}`,
                      backgroundColor: optionHotIce === 'ICE' ? 'rgba(116, 185, 255, 0.2)' : 'transparent',
                      color: optionHotIce === 'ICE' ? '#74b9ff' : colors.text
                    }}
                  >
                    ICE (+{Number(selectedMenu.options.icePrice || 0).toLocaleString()}원)
                  </button>
                </div>
              </div>
            )}

            {selectedMenu.options?.useShot && (
              <div style={styles.optionBlock}>
                <h4 style={styles.optionTitle}>추가 옵션</h4>

                <label
                  style={{
                    ...styles.shotLabel,
                    border: `1px solid ${optionShot ? colors.primary : colors.border}`
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

            <div style={styles.modalFooter}>
              <strong style={styles.previewPrice}>
                {getModalPreviewPrice().toLocaleString()}원
              </strong>

              <div style={styles.modalButtonGroup}>
                <button
                  onClick={() => setSelectedMenu(null)}
                  style={styles.secondaryButton}
                >
                  취소
                </button>

                <button
                  onClick={handleConfirmOption}
                  style={styles.primarySmallButton}
                >
                  담기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={styles.cartArea}>
        <div style={styles.cartList}>
          {cart.length === 0 ? (
            <div style={styles.emptyCart}>
              장바구니가 비어있습니다.
            </div>
          ) : (
            cart.map((item, idx) => (
              <div
                key={`${item.id}-${item.selectedHotIce || 'none'}-${item.selectedShot ? 'shot' : 'noshot'}-${idx}`}
                style={styles.cartItem}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={styles.cartItemName}>
                    {item.name}
                  </div>

                  <div style={styles.cartOption}>
                    {item.selectedHotIce && `[${item.selectedHotIce}] `}
                    {item.selectedShot && '[샷 추가]'}
                  </div>

                  <div style={styles.cartPrice}>
                    {(Number(item.finalPrice || 0) * Number(item.quantity || 0)).toLocaleString()}원
                  </div>
                </div>

                <div style={styles.quantityBox}>
                  <button
                    onClick={() => decreaseCartQuantity(idx)}
                    style={styles.quantityButton}
                  >
                    -
                  </button>

                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateCartQuantity(idx, e.target.value)}
                    style={styles.quantityInput}
                  />

                  <button
                    onClick={() => increaseCartQuantity(idx)}
                    style={styles.quantityButton}
                  >
                    +
                  </button>

                  <button
                    onClick={() => removeCartItem(idx)}
                    style={styles.removeButton}
                  >
                    X
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={styles.paymentBox}>
          <div style={styles.paymentGrid}>
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

          <div style={styles.pointUseRow}>
            <input
              type="text"
              value={usePoints}
              onChange={handleUsePointsChange}
              disabled={maxUsablePoints <= 0}
              placeholder="사용할 포인트"
              style={styles.pointInput}
            />

            <button
              onClick={useMaxPoints}
              disabled={maxUsablePoints <= 0}
              style={{
                ...styles.pointButton,
                backgroundColor: maxUsablePoints <= 0 ? colors.border : colors.primary
              }}
            >
              최대
            </button>

            <button
              onClick={clearUsePoints}
              style={styles.pointResetButton}
            >
              초기화
            </button>
          </div>

          <div style={styles.discountRow}>
            <span>포인트 할인</span>
            <strong style={{ color: colors.danger }}>
              -{safeUsePoints.toLocaleString()}원
            </strong>
          </div>

          <div style={styles.finalTotalRow}>
            <span>최종 결제 금액</span>
            <strong>
              {cartTotal.toLocaleString()}원
            </strong>
          </div>
        </div>

        <div style={styles.bottomRow}>
          <div style={styles.phoneDisplay}>
            {formatPhone(phone)}
          </div>

          <button onClick={handleOrder} style={styles.orderButton}>
            {cartTotal.toLocaleString()}원 결제
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, danger }) {
  return (
    <div style={styles.summaryRow}>
      <span>{label}</span>
      <strong style={{ color: danger ? colors.danger : colors.text }}>
        {value}
      </strong>
    </div>
  );
}

const styles = {
  centerPage: {
    backgroundColor: colors.bg,
    color: colors.text,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box'
  },
  phoneBox: {
    marginTop: '50px',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  title: {
    textAlign: 'center',
    color: colors.primary,
    margin: 0
  },
  description: {
    textAlign: 'center',
    color: colors.textDim,
    margin: '0 0 10px 0',
    fontSize: '14px',
    lineHeight: 1.6
  },
  phoneInput: {
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
  },
  primaryButton: {
    width: '100%',
    height: '60px',
    backgroundColor: colors.primary,
    color: '#000',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '20px',
    cursor: 'pointer'
  },
  completeBox: {
    backgroundColor: colors.surface,
    padding: '40px',
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    textAlign: 'center',
    marginTop: '30px',
    width: '100%',
    maxWidth: '430px',
    boxSizing: 'border-box'
  },
  completeTitle: {
    color: colors.primary,
    marginBottom: '20px'
  },
  qrBox: {
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '12px',
    display: 'inline-block',
    marginBottom: '15px'
  },
  qrCodeText: {
    color: colors.textDim,
    fontSize: '15px',
    marginBottom: '25px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  priceSummary: {
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    padding: '15px',
    marginBottom: '25px',
    textAlign: 'left'
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    color: colors.textDim
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: '10px',
    borderTop: `1px solid ${colors.border}`,
    fontSize: '20px',
    fontWeight: 'bold'
  },
  pointNotice: {
    fontSize: '16px',
    color: colors.primary,
    marginBottom: '35px',
    fontWeight: 'bold',
    lineHeight: '1.6'
  },
  completeButtonGroup: {
    display: 'flex',
    gap: '10px',
    flexDirection: 'column'
  },
  secondaryButton: {
    padding: '12px 15px',
    backgroundColor: 'transparent',
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  orderPage: {
    backgroundColor: colors.bg,
    color: colors.text,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'sans-serif',
    position: 'relative',
    overflow: 'hidden'
  },
  menuArea: {
    flex: 1,
    padding: '18px 20px',
    overflowY: 'auto',
    minHeight: 0
  },
  categoryRow: {
    display: 'flex',
    gap: '10px',
    overflowX: 'auto',
    paddingBottom: '10px',
    marginBottom: '18px'
  },
  categoryButton: {
    padding: '10px 20px',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '15px',
    paddingBottom: '20px'
  },
  emptyMenu: {
    color: colors.textDim,
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '40px 0'
  },
  menuCard: {
    backgroundColor: colors.surface,
    padding: '15px',
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
    textAlign: 'center'
  },
  menuName: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  menuPrice: {
    color: colors.primary,
    fontWeight: 'bold'
  },
  modalOverlay: {
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
  },
  modalBox: {
    backgroundColor: colors.surface,
    padding: '25px',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '400px',
    border: `1px solid ${colors.border}`,
    boxSizing: 'border-box'
  },
  modalTitle: {
    margin: '0 0 20px 0',
    color: colors.primary,
    textAlign: 'center'
  },
  optionBlock: {
    marginBottom: '20px'
  },
  optionTitle: {
    margin: '0 0 10px 0',
    color: colors.textDim
  },
  optionRow: {
    display: 'flex',
    gap: '10px'
  },
  optionButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  shotLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '20px',
    paddingTop: '20px',
    borderTop: `1px solid ${colors.border}`
  },
  previewPrice: {
    fontSize: '20px'
  },
  modalButtonGroup: {
    display: 'flex',
    gap: '10px'
  },
  primarySmallButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: colors.primary,
    color: '#000',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  cartArea: {
    backgroundColor: colors.surface,
    padding: '12px 18px',
    borderTop: `1px solid ${colors.border}`,
    zIndex: 100,
    boxSizing: 'border-box',
    width: '100%',
    maxHeight: '48vh',
    overflowY: 'auto',
    flexShrink: 0
  },
  cartList: {
    maxHeight: '150px',
    minHeight: '60px',
    overflowY: 'auto',
    marginBottom: '10px',
    paddingRight: '4px'
  },
  emptyCart: {
    color: colors.textDim,
    textAlign: 'center',
    padding: '20px 0'
  },
  cartItem: {
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
  },
  cartItemName: {
    fontWeight: 'bold',
    fontSize: '14px',
    marginBottom: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  cartOption: {
    fontSize: '11px',
    color: colors.textDim,
    minHeight: '13px'
  },
  cartPrice: {
    marginTop: '3px',
    fontSize: '13px',
    color: colors.primary,
    fontWeight: 'bold'
  },
  quantityBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  quantityButton: {
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
  },
  quantityInput: {
    width: '48px',
    height: '30px',
    textAlign: 'center',
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.text,
    fontWeight: 'bold',
    boxSizing: 'border-box'
  },
  removeButton: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    border: `1px solid ${colors.danger}`,
    backgroundColor: 'transparent',
    color: colors.danger,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  paymentBox: {
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '10px',
    padding: '10px',
    marginBottom: '10px'
  },
  paymentGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px 12px',
    marginBottom: '10px',
    fontSize: '13px',
    color: colors.textDim
  },
  pointUseRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    gap: '8px',
    marginBottom: '8px'
  },
  pointInput: {
    height: '36px',
    padding: '0 10px',
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.text,
    boxSizing: 'border-box',
    fontWeight: 'bold'
  },
  pointButton: {
    height: '36px',
    padding: '0 12px',
    borderRadius: '6px',
    border: 'none',
    color: '#000',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  pointResetButton: {
    height: '36px',
    padding: '0 12px',
    borderRadius: '6px',
    border: `1px solid ${colors.border}`,
    backgroundColor: 'transparent',
    color: colors.text,
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  discountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: colors.textDim,
    marginBottom: '6px'
  },
  finalTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '15px',
    color: colors.textDim,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: '8px'
  },
  bottomRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  phoneDisplay: {
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
  },
  orderButton: {
    height: '50px',
    backgroundColor: colors.primary,
    color: '#000',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '17px',
    cursor: 'pointer',
    boxSizing: 'border-box'
  }
};
