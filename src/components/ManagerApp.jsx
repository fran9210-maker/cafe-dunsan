import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { colors, Logo, getTodayStr } from '../utils/theme';
import Statistics from "./StatisticsView"; // 분리한 통계 컴포넌트 불러오기

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

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'menus'));
    const unsubscribe = onSnapshot(q, (snapshot) => setMenus(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(cats);
      if (cats.length > 0 && !newMenuCategory) setNewMenuCategory(cats[0].name);
    });
    return () => unsubscribe();
  }, []);

  const handleComplete = async (orderId) => {
    try { await updateDoc(doc(db, 'orders', orderId), { status: 'completed' }); } 
    catch (error) { console.error("상태 업데이트 실패:", error); }
  };

  const handlePaymentComplete = async (order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { paymentStatus: 'completed' });
      handlePrint(order, 'order');
    } catch (error) { console.error("결제 상태 업데이트 실패:", error); }
  };

  const handlePrint = (order, type) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return alert("팝업 차단이 설정되어 있습니다. 팝업을 허용해주세요.");

    const isReceipt = type === 'receipt';
    const title = isReceipt ? '영수증 (고객용)' : '주문서 (주방용)';
    const storeName = isReceipt ? '그대, 요한을 만나다' : '[주방 제조용 주문서]';

    const htmlContent = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Malgun Gothic', sans-serif; width: 300px; margin: 0 auto; padding: 20px; color: #000; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #000; padding-bottom: 15px; }
            .header h2 { margin: 0 0 10px 0; font-size: 22px; }
            .header p { margin: 5px 0; font-size: 14px; }
            .item { display: flex; justify-content: space-between; margin-bottom: 5px; font-weight: bold; font-size: 16px; }
            .options { font-size: 14px; color: #555; margin-left: 10px; margin-bottom: 15px; }
            .total { margin-top: 20px; border-top: 2px dashed #000; padding-top: 15px; font-weight: bold; font-size: 20px; display: flex; justify-content: space-between; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #555; }
            .order-num { font-size: 24px; font-weight: bold; text-align: center; padding: 10px; border: 2px solid #000; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${storeName}</h2>
            <p>주문일시: ${order.date} ${order.time}</p>
            ${isReceipt ? `<p>고객번호: ${order.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3')}</p>` : ''}
          </div>
          ${!isReceipt ? `<div class="order-num">주문번호: ${order.id.slice(-4).toUpperCase()}</div>` : ''}
          <div>
            ${order.items.map(item => `
              <div class="item">
                <span>${item.name} x ${item.quantity}</span>
                ${isReceipt ? `<span>${(item.finalPrice * item.quantity).toLocaleString()}원</span>` : ''}
              </div>
              <div class="options">
                ${item.selectedHotIce ? `[${item.selectedHotIce}] ` : ''}
                ${item.selectedShot ? `[샷 추가]` : ''}
              </div>
            `).join('')}
          </div>
          ${isReceipt ? `
            <div class="total">
              <span>총 결제 금액</span>
              <span>${Number(order.totalPrice).toLocaleString()}원</span>
            </div>
            <div class="footer">
              이용해 주셔서 감사합니다.<br/>
              적립된 포인트: ${order.earnedPoints ? order.earnedPoints.toLocaleString() : 0} P
            </div>
          ` : `<div class="footer">- 제조가 완료되면 고객에게 알려주세요 -</div>`}
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
    if (!newCategoryName.trim()) return;
    await addDoc(collection(db, 'categories'), { name: newCategoryName.trim(), createdAt: Date.now() });
    setNewCategoryName('');
  };

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'categories', categoryId));
  };

  const handleAddMenu = async (e) => {
    e.preventDefault();
    if (!newMenuName || !newMenuPrice || !newMenuCategory) return alert("모두 입력해주세요.");
    await addDoc(collection(db, 'menus'), {
      name: newMenuName, price: Number(newMenuPrice), category: newMenuCategory,
      options: { useHotIce, hotPrice: Number(hotPrice), icePrice: Number(icePrice), useShot, shotPrice: Number(shotPrice) },
      createdAt: Date.now()
    });
    setNewMenuName(''); setNewMenuPrice(''); setUseHotIce(false); setHotPrice(0); setIcePrice(0); setUseShot(false); setShotPrice(500);
  };

  const handleDeleteMenu = async (menuId) => {
    if (window.confirm('삭제하시겠습니까?')) await deleteDoc(doc(db, 'menus', menuId));
  };

  const getTabStyle = (tabName) => ({
    padding: '10px 20px', backgroundColor: activeTab === tabName ? colors.primary : 'transparent', color: activeTab === tabName ? '#000' : colors.text,
    border: `1px solid ${activeTab === tabName ? colors.primary : colors.border}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px'
  });

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: '100vh', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '30px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <Logo />
          <h2 style={{ margin: 0, color: colors.primary }}>관리자 대시보드</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTab('pending')} style={getTabStyle('pending')}>제조 대기</button>
          <button onClick={() => setActiveTab('completed')} style={getTabStyle('completed')}>제조 완료</button>
          <button onClick={() => setActiveTab('list')} style={getTabStyle('list')}>주문 목록</button>
          <button onClick={() => setActiveTab('stats')} style={getTabStyle('stats')}>상세 통계</button>
          <button onClick={() => setActiveTab('menu')} style={getTabStyle('menu')}>메뉴 관리</button>
        </div>
      </header>

      <div>
        {activeTab === 'pending' && (
          <div>
            <h3 style={{ color: colors.primary, marginBottom: '20px' }}>제조 대기 중인 주문</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {orders.filter(o => o.status === 'pending').length === 0 ? (
                <p style={{ color: colors.textDim }}>대기 중인 주문이 없습니다.</p>
              ) : (
                orders.filter(o => o.status === 'pending').map(order => (
                  <div key={order.id} style={{ backgroundColor: '#1A1A1A', border: `2px solid ${colors.primary}`, borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}`, paddingBottom: '10px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{order.phone ? order.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '번호 없음'}</span>
                      <span style={{ backgroundColor: colors.danger, color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '14px' }}>대기 중</span>
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      {order.items && order.items.map((item, idx) => (
                        <div key={idx} style={{ color: colors.text, marginBottom: '8px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>- {item.name} ({item.quantity}개)</div>
                          {(item.selectedHotIce || item.selectedShot) && (
                            <div style={{ fontSize: '14px', color: colors.textDim, marginLeft: '15px', marginTop: '4px' }}>
                              {item.selectedHotIce && <span>[{item.selectedHotIce}] </span>}
                              {item.selectedShot && <span>[샷 추가]</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', paddingTop: '15px', borderTop: `1px solid ${colors.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '18px' }}>총 {Number(order.totalPrice).toLocaleString()}원</span>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: order.paymentStatus === 'completed' ? colors.success : colors.danger }}>
                          {order.paymentStatus === 'completed' ? '✅ 결제 완료됨' : '⏳ 결제 대기중'}
                        </span>
                      </div>

                      <button onClick={() => handlePaymentComplete(order)} style={{ backgroundColor: order.paymentStatus === 'completed' ? colors.surface : colors.success, color: order.paymentStatus === 'completed' ? colors.textDim : '#fff', border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }} disabled={order.paymentStatus === 'completed'}>
                        {order.paymentStatus === 'completed' ? '결제 완료됨' : '결제 완료 (주문서 출력)'}
                      </button>

                      <button onClick={() => handlePrint(order, 'receipt')} style={{ backgroundColor: 'transparent', color: colors.text, border: `1px solid ${colors.border}`, padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>
                        영수증 프린트 (고객용)
                      </button>

                      <button onClick={() => handleComplete(order.id)} style={{ backgroundColor: colors.primary, color: '#000', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px', marginTop: '10px' }}>
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
            <h3 style={{ color: colors.success, marginBottom: '20px' }}>제조 완료된 주문</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {orders.filter(o => o.status === 'completed').length === 0 ? (
                <p style={{ color: colors.textDim }}>완료된 주문이 없습니다.</p>
              ) : (
                orders.filter(o => o.status === 'completed').map(order => (
                  <div key={order.id} style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, opacity: 0.7, borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}`, paddingBottom: '10px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: colors.textDim }}>{order.phone ? order.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '번호 없음'}</span>
                      <span style={{ backgroundColor: colors.success, color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '14px' }}>완료됨</span>
                    </div>
                    {order.items && order.items.map((item, idx) => (
                      <div key={idx} style={{ color: colors.textDim, marginBottom: '5px' }}>
                        - {item.name} ({item.quantity}개)
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div>
            <h3 style={{ marginBottom: '20px' }}>전체 주문 내역</h3>
            <div style={{ backgroundColor: colors.surface, borderRadius: '12px', padding: '20px', border: `1px solid ${colors.border}` }}>
              {orders.map(order => (
                <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <span>{order.date} {order.time}</span>
                  <span>{order.phone ? order.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '번호 없음'}</span>
                  <span>{order.status === 'pending' ? '대기 중' : '완료됨'}</span>
                  <span>{Number(order.totalPrice).toLocaleString()}원</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 분리된 통계 컴포넌트 렌더링 */}
        {activeTab === 'stats' && <Statistics orders={orders} menus={menus} />}

        {activeTab === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ backgroundColor: colors.surface, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <h3 style={{ marginBottom: '15px', color: colors.primary }}>1. 카테고리 관리</h3>
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <input type="text" placeholder="새 카테고리명 입력" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px' }} />
                <button type="submit" style={{ backgroundColor: colors.secondary, color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>카테고리 추가</button>
              </form>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: colors.bg, padding: '8px 12px', borderRadius: '20px', border: `1px solid ${colors.border}` }}>
                    <span>{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id)} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: '16px', padding: '0' }}>&times;</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: colors.surface, padding: '20px', borderRadius: '12px', border: `1px solid ${colors.border}` }}>
              <h3 style={{ marginBottom: '15px', color: colors.primary }}>2. 새 메뉴 추가</h3>
              <form onSubmit={handleAddMenu} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select value={newMenuCategory} onChange={(e) => setNewMenuCategory(e.target.value)} style={{ padding: '10px', backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px', width: '150px' }}>
                    {categories.length === 0 ? <option value="">카테고리 없음</option> : categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                  <input type="text" placeholder="메뉴명" value={newMenuName} onChange={(e) => setNewMenuName(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px' }} />
                  <input type="number" placeholder="기본 가격" value={newMenuPrice} onChange={(e) => setNewMenuPrice(e.target.value)} style={{ width: '150px', padding: '10px', backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '6px' }} />
                </div>

                <div style={{ backgroundColor: colors.bg, padding: '15px', borderRadius: '8px', border: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={useHotIce} onChange={(e) => setUseHotIce(e.target.checked)} />
                      HOT / ICE 옵션 사용
                    </label>
                    {useHotIce && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input type="number" placeholder="HOT 추가금액" value={hotPrice} onChange={(e) => setHotPrice(e.target.value)} style={{ width: '120px', padding: '6px', backgroundColor: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '4px' }} />원
                        <input type="number" placeholder="ICE 추가금액" value={icePrice} onChange={(e) => setIcePrice(e.target.value)} style={{ width: '120px', padding: '6px', backgroundColor: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '4px' }} />원
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={useShot} onChange={(e) => setUseShot(e.target.checked)} />
                      샷 추가 옵션 사용
                    </label>
                    {useShot && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input type="number" placeholder="샷 추가금액" value={shotPrice} onChange={(e) => setShotPrice(e.target.value)} style={{ width: '120px', padding: '6px', backgroundColor: colors.surface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '4px' }} />원
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" style={{ backgroundColor: colors.primary, color: '#000', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>메뉴 등록하기</button>
              </form>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {categories.map(cat => {
                const categoryMenus = menus.filter(menu => menu.category === cat.name);
                if (categoryMenus.length === 0) return null;
                
                return (
                  <div key={cat.id} style={{ backgroundColor: colors.surface, padding: '15px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                    <h4 style={{ color: colors.primary, fontSize: '20px', margin: '0 0 15px 0', paddingBottom: '10px', borderBottom: `1px solid ${colors.border}` }}>
                      {cat.name}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {categoryMenus.map(menu => (
                        <div key={menu.id} style={{ backgroundColor: colors.bg, padding: '12px', borderRadius: '6px', border: `1px solid ${colors.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ color: colors.text, fontWeight: 'bold', fontSize: '16px' }}>{menu.name}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: colors.textDim }}>{Number(menu.price).toLocaleString()}원</span>
                              <button onClick={() => handleDeleteMenu(menu.id)} style={{ backgroundColor: 'transparent', color: colors.danger, border: `1px solid ${colors.danger}`, padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
                            </div>
                          </div>
                          {menu.options && (
                            <div style={{ fontSize: '13px', color: colors.textDim }}>
                              {menu.options.useHotIce && <div>└ HOT: +{menu.options.hotPrice}원 / ICE: +{menu.options.icePrice}원</div>}
                              {menu.options.useShot && <div>└ 샷 추가: +{menu.options.shotPrice}원</div>}
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
