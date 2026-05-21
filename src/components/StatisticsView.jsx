import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { colors } from '../utils/theme';

export default function StatisticsView({ orders = [], menus = [] }) {
  const [statTab, setStatTab] = useState('time');

  // 집계 단위
  const [timeGroupBy, setTimeGroupBy] = useState('daily');
  const [amountGroupBy, setAmountGroupBy] = useState('daily');

  // 직접 지정 기간
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [customers, setCustomers] = useState([]);

  // 고객 포인트 정보 실시간 구독
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const customerList = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      setCustomers(customerList);
    });

    return () => unsubscribe();
  }, []);

  // ==========================================
  // 날짜 / 포맷 유틸
  // ==========================================

  const formatDateInput = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  };

  const getTodayString = () => {
    return formatDateInput(new Date());
  };

  const getThisMonthStart = () => {
    const now = new Date();
    return formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const getThisMonthEnd = () => {
    const now = new Date();
    return formatDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  };

  const getLast7DaysStart = () => {
    const now = new Date();
    now.setDate(now.getDate() - 6);
    return formatDateInput(now);
  };

  const parseOrderDate = (dateValue) => {
    if (!dateValue) return null;

    const dateText = String(dateValue).substring(0, 10);
    const parsed = new Date(`${dateText}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  };

  const isOrderInDateRange = (order) => {
    // 기간을 지정하지 않으면 전체 기간
    if (!startDate && !endDate) return true;

    const orderDate = parseOrderDate(order.date);

    if (!orderDate) return false;

    if (startDate) {
      const start = new Date(`${startDate}T00:00:00`);

      if (orderDate < start) return false;
    }

    if (endDate) {
      const end = new Date(`${endDate}T23:59:59`);

      if (orderDate > end) return false;
    }

    return true;
  };

  const dateRangeLabel = () => {
    if (!startDate && !endDate) return '전체 기간';
    if (startDate && endDate) return `${startDate} ~ ${endDate}`;
    if (startDate) return `${startDate} 이후`;
    return `${endDate} 이전`;
  };

  const formatPhone = (phone) => {
    if (!phone) return '번호 없음';

    const onlyNumber = String(phone).replace(/[^0-9]/g, '');

    if (onlyNumber.length === 11) {
      return onlyNumber.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }

    if (onlyNumber.length === 10) {
      return onlyNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }

    return String(phone);
  };

  const getOrderDateKey = (order, groupBy) => {
    const dateValue = order.date;

    if (!dateValue) return '날짜 없음';

    const dateText = String(dateValue).substring(0, 10);

    if (groupBy === 'daily') {
      return dateText;
    }

    if (groupBy === 'monthly') {
      return dateText.substring(0, 7);
    }

    if (groupBy === 'yearly') {
      return dateText.substring(0, 4);
    }

    if (groupBy === 'weekly') {
      const d = new Date(`${dateText}T00:00:00`);

      if (Number.isNaN(d.getTime())) {
        return '날짜 오류';
      }

      // ISO 주차 계산
      const tempDate = new Date(d.getTime());
      const dayNumber = tempDate.getDay() || 7;
      tempDate.setDate(tempDate.getDate() + 4 - dayNumber);

      const yearStart = new Date(tempDate.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);

      return `${tempDate.getFullYear()}년 ${weekNumber}주차`;
    }

    return dateText;
  };

  const getGroupLabel = (groupBy) => {
    if (groupBy === 'daily') return '일별';
    if (groupBy === 'weekly') return '주별';
    if (groupBy === 'monthly') return '월별';
    if (groupBy === 'yearly') return '연별';
    return '일별';
  };

  const getAmountBand = (price) => {
    const amount = Number(price || 0);

    if (amount < 10000) {
      return '1만원 미만';
    }

    if (amount < 20000) {
      return '1만원 ~ 2만원';
    }

    if (amount < 30000) {
      return '2만원 ~ 3만원';
    }

    return '3만원 이상';
  };

  const amountBandLabels = [
    '1만원 미만',
    '1만원 ~ 2만원',
    '2만원 ~ 3만원',
    '3만원 이상'
  ];

  // ==========================================
  // 기간 필터 적용 주문
  // ==========================================

  const completedOrders = useMemo(() => {
    return orders.filter(order => order.status === 'completed');
  }, [orders]);

  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => isOrderInDateRange(order));
  }, [completedOrders, startDate, endDate]);

  const filteredAllOrders = useMemo(() => {
    return orders.filter(order => isOrderInDateRange(order));
  }, [orders, startDate, endDate]);

  // ==========================================
  // 1. 기간별 매출 통계
  // ==========================================

  const timeStats = {};

  filteredCompletedOrders.forEach(order => {
    const key = getOrderDateKey(order, timeGroupBy);

    if (!timeStats[key]) {
      timeStats[key] = {
        count: 0,
        revenue: 0,
        subtotalRevenue: 0,
        usedPoints: 0,
        earnedPoints: 0
      };
    }

    timeStats[key].count += 1;
    timeStats[key].revenue += Number(order.totalPrice || 0);
    timeStats[key].subtotalRevenue += Number(
      order.subtotalPrice !== undefined ? order.subtotalPrice : order.totalPrice || 0
    );
    timeStats[key].usedPoints += Number(order.usedPoints || 0);
    timeStats[key].earnedPoints += Number(order.earnedPoints || 0);
  });

  // ==========================================
  // 2. 카테고리별 매출 통계
  // ==========================================

  const menuCategoryMap = menus.reduce((acc, menu) => {
    acc[menu.name] = menu.category;
    return acc;
  }, {});

  const categoryStats = {};

  filteredCompletedOrders.forEach(order => {
    const items = order.items || [];

    items.forEach(item => {
      const categoryName = menuCategoryMap[item.name] || '기타/삭제됨';

      if (!categoryStats[categoryName]) {
        categoryStats[categoryName] = {
          qty: 0,
          revenue: 0
        };
      }

      categoryStats[categoryName].qty += Number(item.quantity || 0);
      categoryStats[categoryName].revenue += Number(item.finalPrice || 0) * Number(item.quantity || 0);
    });
  });

  // ==========================================
  // 3. 품목별 매출 통계
  // ==========================================

  const itemStats = {};

  filteredCompletedOrders.forEach(order => {
    const items = order.items || [];

    items.forEach(item => {
      if (!itemStats[item.name]) {
        itemStats[item.name] = {
          qty: 0,
          revenue: 0
        };
      }

      itemStats[item.name].qty += Number(item.quantity || 0);
      itemStats[item.name].revenue += Number(item.finalPrice || 0) * Number(item.quantity || 0);
    });
  });

  // ==========================================
  // 4. 주문자별 통계 + 포인트 통계
  // ==========================================

  const customerPointMap = customers.reduce((acc, customer) => {
    const phoneKey = String(customer.phone || customer.id || '').replace(/[^0-9]/g, '');

    if (!phoneKey) return acc;

    acc[phoneKey] = {
      remainingPoints: Number(customer.points || 0),
      totalEarnedPoints: Number(customer.totalEarnedPoints || 0),
      totalUsedPoints: Number(customer.totalUsedPoints || 0)
    };

    return acc;
  }, {});

  const customerStats = {};

  /*
    주문자별 통계는 지정 기간 안의 주문을 기준으로 집계합니다.
    단, 잔여 포인트는 customers 컬렉션의 현재 잔여 포인트를 표시합니다.
  */
  filteredAllOrders.forEach(order => {
    const rawPhone = String(order.phone || '').replace(/[^0-9]/g, '');
    const phoneKey = rawPhone || 'unknown';
    const displayPhone = rawPhone ? formatPhone(rawPhone) : '번호 없음';

    if (!customerStats[phoneKey]) {
      customerStats[phoneKey] = {
        phone: displayPhone,
        count: 0,
        revenue: 0,
        subtotalRevenue: 0,
        totalEarnedPoints: 0,
        totalUsedPoints: 0,
        remainingPoints: 0
      };
    }

    customerStats[phoneKey].count += 1;
    customerStats[phoneKey].revenue += Number(order.totalPrice || 0);
    customerStats[phoneKey].subtotalRevenue += Number(
      order.subtotalPrice !== undefined ? order.subtotalPrice : order.totalPrice || 0
    );
    customerStats[phoneKey].totalEarnedPoints += Number(order.earnedPoints || 0);
    customerStats[phoneKey].totalUsedPoints += Number(order.usedPoints || 0);
  });

  Object.keys(customerStats).forEach(phoneKey => {
    const pointInfo = customerPointMap[phoneKey];

    if (pointInfo) {
      customerStats[phoneKey].remainingPoints = pointInfo.remainingPoints;
    } else {
      customerStats[phoneKey].remainingPoints =
        customerStats[phoneKey].totalEarnedPoints - customerStats[phoneKey].totalUsedPoints;
    }
  });

  // 고객 문서는 있으나 지정 기간 주문이 없는 고객도 잔여 포인트 확인용으로 표시
  customers.forEach(customer => {
    const phoneKey = String(customer.phone || customer.id || '').replace(/[^0-9]/g, '');

    if (!phoneKey) return;

    if (!customerStats[phoneKey]) {
      customerStats[phoneKey] = {
        phone: formatPhone(phoneKey),
        count: 0,
        revenue: 0,
        subtotalRevenue: 0,
        totalEarnedPoints: 0,
        totalUsedPoints: 0,
        remainingPoints: Number(customer.points || 0)
      };
    }
  });

  // ==========================================
  // 5. 결제 액수별 통계
  // ==========================================

  const amountPeriodStats = {};

  filteredCompletedOrders.forEach(order => {
    const periodKey = getOrderDateKey(order, amountGroupBy);
    const price = Number(order.totalPrice || 0);
    const bandKey = getAmountBand(price);

    if (!amountPeriodStats[periodKey]) {
      amountPeriodStats[periodKey] = {
        period: periodKey,
        totalCount: 0,
        totalRevenue: 0,
        bands: {
          '1만원 미만': {
            count: 0,
            revenue: 0
          },
          '1만원 ~ 2만원': {
            count: 0,
            revenue: 0
          },
          '2만원 ~ 3만원': {
            count: 0,
            revenue: 0
          },
          '3만원 이상': {
            count: 0,
            revenue: 0
          }
        }
      };
    }

    amountPeriodStats[periodKey].bands[bandKey].count += 1;
    amountPeriodStats[periodKey].bands[bandKey].revenue += price;
    amountPeriodStats[periodKey].totalCount += 1;
    amountPeriodStats[periodKey].totalRevenue += price;
  });

  // ==========================================
  // 전체 요약
  // ==========================================

  const summaryStats = {
    completedOrderCount: filteredCompletedOrders.length,
    totalRevenue: filteredCompletedOrders.reduce(
      (sum, order) => sum + Number(order.totalPrice || 0),
      0
    ),
    totalSubtotal: filteredCompletedOrders.reduce(
      (sum, order) => sum + Number(
        order.subtotalPrice !== undefined ? order.subtotalPrice : order.totalPrice || 0
      ),
      0
    ),
    totalUsedPoints: filteredCompletedOrders.reduce(
      (sum, order) => sum + Number(order.usedPoints || 0),
      0
    ),
    totalEarnedPoints: filteredCompletedOrders.reduce(
      (sum, order) => sum + Number(order.earnedPoints || 0),
      0
    ),
    allOrderCount: filteredAllOrders.length
  };

  // ==========================================
  // 엑셀 내보내기 유틸
  // ==========================================

  const escapeXml = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const safeSheetName = (name) => {
    return String(name)
      .replace(/[\\/?*[\]:]/g, '')
      .substring(0, 31);
  };

  const makeCell = (value, type = 'String') => {
    const isNumberType = type === 'Number';
    const cellType = isNumberType ? 'Number' : 'String';
    const cellValue = isNumberType ? Number(value || 0) : escapeXml(value);

    return `<Cell><Data ss:Type="${cellType}">${cellValue}</Data></Cell>`;
  };

  const makeRow = (cells = []) => {
    return `<Row>${cells.join('')}</Row>`;
  };

  const makeWorksheet = (name, rows = []) => {
    return `
      <Worksheet ss:Name="${escapeXml(safeSheetName(name))}">
        <Table>
          ${rows.join('')}
        </Table>
      </Worksheet>
    `;
  };

  const downloadExcelFile = (fileName, workbookXml) => {
    const blob = new Blob([workbookXml], {
      type: 'application/vnd.ms-excel;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAllStatsToExcel = () => {
    const createdAt = new Date();
    const createdAtText = `${formatDateInput(createdAt)} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;

    const timeEntries = Object.entries(timeStats)
      .map(([key, value]) => ({
        period: key,
        ...value
      }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));

    const categoryEntries = Object.entries(categoryStats)
      .map(([key, value]) => ({
        category: key,
        ...value
      }))
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

    const itemEntries = Object.entries(itemStats)
      .map(([key, value]) => ({
        itemName: key,
        ...value
      }))
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

    const customerEntries = Object.values(customerStats)
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

    const amountEntries = Object.values(amountPeriodStats)
      .sort((a, b) => (a.period < b.period ? 1 : -1));

    const summaryRows = [
      makeRow([makeCell('통계 기준 기간'), makeCell(dateRangeLabel())]),
      makeRow([makeCell('파일 생성일시'), makeCell(createdAtText)]),
      makeRow([makeCell('')]),
      makeRow([makeCell('항목'), makeCell('값')]),
      makeRow([makeCell('전체 주문 수'), makeCell(summaryStats.allOrderCount, 'Number')]),
      makeRow([makeCell('제조 완료 주문 수'), makeCell(summaryStats.completedOrderCount, 'Number')]),
      makeRow([makeCell('상품 합계'), makeCell(summaryStats.totalSubtotal, 'Number')]),
      makeRow([makeCell('사용 포인트'), makeCell(summaryStats.totalUsedPoints, 'Number')]),
      makeRow([makeCell('실제 매출'), makeCell(summaryStats.totalRevenue, 'Number')]),
      makeRow([makeCell('적립 포인트'), makeCell(summaryStats.totalEarnedPoints, 'Number')])
    ];

    const timeRows = [
      makeRow([
        makeCell('기간'),
        makeCell('주문 건수'),
        makeCell('상품 합계'),
        makeCell('사용 포인트'),
        makeCell('실제 매출'),
        makeCell('적립 포인트')
      ]),
      ...timeEntries.map(row => makeRow([
        makeCell(row.period),
        makeCell(row.count, 'Number'),
        makeCell(row.subtotalRevenue, 'Number'),
        makeCell(row.usedPoints, 'Number'),
        makeCell(row.revenue, 'Number'),
        makeCell(row.earnedPoints, 'Number')
      ]))
    ];

    const categoryRows = [
      makeRow([
        makeCell('카테고리명'),
        makeCell('판매 수량'),
        makeCell('매출액')
      ]),
      ...categoryEntries.map(row => makeRow([
        makeCell(row.category),
        makeCell(row.qty, 'Number'),
        makeCell(row.revenue, 'Number')
      ]))
    ];

    const itemRows = [
      makeRow([
        makeCell('품목명'),
        makeCell('판매 수량'),
        makeCell('매출액')
      ]),
      ...itemEntries.map(row => makeRow([
        makeCell(row.itemName),
        makeCell(row.qty, 'Number'),
        makeCell(row.revenue, 'Number')
      ]))
    ];

    const customerRows = [
      makeRow([
        makeCell('주문자'),
        makeCell('주문 건수'),
        makeCell('상품 합계'),
        makeCell('실제 결제액'),
        makeCell('기간 내 적립 포인트'),
        makeCell('기간 내 사용 포인트'),
        makeCell('현재 잔여 포인트')
      ]),
      ...customerEntries.map(row => makeRow([
        makeCell(row.phone),
        makeCell(row.count, 'Number'),
        makeCell(row.subtotalRevenue, 'Number'),
        makeCell(row.revenue, 'Number'),
        makeCell(row.totalEarnedPoints, 'Number'),
        makeCell(row.totalUsedPoints, 'Number'),
        makeCell(row.remainingPoints, 'Number')
      ]))
    ];

    const amountRows = [
      makeRow([
        makeCell('기간'),
        makeCell('1만원 미만 건수'),
        makeCell('1만원 미만 매출'),
        makeCell('1만원 ~ 2만원 건수'),
        makeCell('1만원 ~ 2만원 매출'),
        makeCell('2만원 ~ 3만원 건수'),
        makeCell('2만원 ~ 3만원 매출'),
        makeCell('3만원 이상 건수'),
        makeCell('3만원 이상 매출'),
        makeCell('총 주문'),
        makeCell('총 매출')
      ]),
      ...amountEntries.map(row => makeRow([
        makeCell(row.period),
        makeCell(row.bands['1만원 미만'].count, 'Number'),
        makeCell(row.bands['1만원 미만'].revenue, 'Number'),
        makeCell(row.bands['1만원 ~ 2만원'].count, 'Number'),
        makeCell(row.bands['1만원 ~ 2만원'].revenue, 'Number'),
        makeCell(row.bands['2만원 ~ 3만원'].count, 'Number'),
        makeCell(row.bands['2만원 ~ 3만원'].revenue, 'Number'),
        makeCell(row.bands['3만원 이상'].count, 'Number'),
        makeCell(row.bands['3만원 이상'].revenue, 'Number'),
        makeCell(row.totalCount, 'Number'),
        makeCell(row.totalRevenue, 'Number')
      ]))
    ];

    const workbookXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook
        xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:html="http://www.w3.org/TR/REC-html40"
      >
        ${makeWorksheet('요약', summaryRows)}
        ${makeWorksheet(`기간별매출_${getGroupLabel(timeGroupBy)}`, timeRows)}
        ${makeWorksheet('카테고리별', categoryRows)}
        ${makeWorksheet('품목별', itemRows)}
        ${makeWorksheet('주문자별', customerRows)}
        ${makeWorksheet(`결제액수별_${getGroupLabel(amountGroupBy)}`, amountRows)}
      </Workbook>
    `;

    const fileDateText = `${startDate || '전체'}_${endDate || '전체'}`.replace(/\s/g, '');
    downloadExcelFile(`통계_${fileDateText}.xls`, workbookXml);
  };

  // ==========================================
  // 스타일 / 렌더 함수
  // ==========================================

  const getSubTabStyle = (tabName) => ({
    padding: '8px 16px',
    backgroundColor: statTab === tabName ? colors.secondary : 'transparent',
    color: statTab === tabName ? '#000' : colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '20px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
    whiteSpace: 'nowrap'
  });

  const getFilterButtonStyle = (active) => ({
    padding: '8px 12px',
    borderRadius: '8px',
    border: `1px solid ${active ? colors.primary : colors.border}`,
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? '#000' : colors.text,
    fontWeight: 'bold',
    cursor: 'pointer'
  });

  const renderGroupButtons = (value, setter) => {
    return (
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '15px',
          flexWrap: 'wrap'
        }}
      >
        <button
          onClick={() => setter('daily')}
          style={getFilterButtonStyle(value === 'daily')}
        >
          일별
        </button>

        <button
          onClick={() => setter('weekly')}
          style={getFilterButtonStyle(value === 'weekly')}
        >
          주별
        </button>

        <button
          onClick={() => setter('monthly')}
          style={getFilterButtonStyle(value === 'monthly')}
        >
          월별
        </button>

        <button
          onClick={() => setter('yearly')}
          style={getFilterButtonStyle(value === 'yearly')}
        >
          연별
        </button>
      </div>
    );
  };

  const renderDateRangeControl = () => {
    return (
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '14px'
          }}
        >
          <div>
            <div
              style={{
                color: colors.primary,
                fontWeight: 'bold',
                fontSize: '16px',
                marginBottom: '4px'
              }}
            >
              통계 기간 설정
            </div>

            <div
              style={{
                color: colors.textDim,
                fontSize: '13px'
              }}
            >
              현재 기준: {dateRangeLabel()}
            </div>
          </div>

          <button
            onClick={exportAllStatsToExcel}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: colors.success,
              color: '#000',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            전체 통계 엑셀 내보내기
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            marginBottom: '12px'
          }}
        >
          <label
            style={{
              color: colors.textDim,
              fontSize: '13px'
            }}
          >
            시작일
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                marginTop: '5px',
                padding: '0 10px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg,
                color: colors.text,
                boxSizing: 'border-box'
              }}
            />
          </label>

          <label
            style={{
              color: colors.textDim,
              fontSize: '13px'
            }}
          >
            종료일
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                marginTop: '5px',
                padding: '0 10px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg,
                color: colors.text,
                boxSizing: 'border-box'
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <button
            onClick={() => {
              const today = getTodayString();
              setStartDate(today);
              setEndDate(today);
            }}
            style={getFilterButtonStyle(false)}
          >
            오늘
          </button>

          <button
            onClick={() => {
              setStartDate(getLast7DaysStart());
              setEndDate(getTodayString());
            }}
            style={getFilterButtonStyle(false)}
          >
            최근 7일
          </button>

          <button
            onClick={() => {
              setStartDate(getThisMonthStart());
              setEndDate(getThisMonthEnd());
            }}
            style={getFilterButtonStyle(false)}
          >
            이번 달
          </button>

          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
            style={getFilterButtonStyle(false)}
          >
            전체 기간
          </button>
        </div>
      </div>
    );
  };

  const renderBasicTable = (dataObj, keyLabel, valLabel1, valLabel2, sortByKey = false) => {
    const entries = Object.entries(dataObj).map(([key, value]) => ({
      key,
      ...value
    }));

    entries.sort((a, b) => {
      if (sortByKey) {
        return a.key < b.key ? 1 : -1;
      }

      return Number(b.revenue || 0) - Number(a.revenue || 0);
    });

    return (
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginTop: '20px',
          backgroundColor: colors.surface,
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        <thead>
          <tr style={{ backgroundColor: colors.primary, color: '#000' }}>
            <th style={{ padding: '12px', textAlign: 'left' }}>
              {keyLabel}
            </th>
            <th style={{ padding: '12px', textAlign: 'right' }}>
              {valLabel1}
            </th>
            <th style={{ padding: '12px', textAlign: 'right' }}>
              {valLabel2}
            </th>
          </tr>
        </thead>

        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan="3"
                style={{
                  padding: '20px',
                  textAlign: 'center',
                  color: colors.textDim
                }}
              >
                데이터가 없습니다.
              </td>
            </tr>
          ) : (
            entries.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: `1px solid ${colors.border}`
                }}
              >
                <td style={{ padding: '12px' }}>
                  {row.key}
                </td>

                <td style={{ padding: '12px', textAlign: 'right' }}>
                  {row.count !== undefined
                    ? `${Number(row.count || 0).toLocaleString()}건`
                    : `${Number(row.qty || 0).toLocaleString()}개`}
                </td>

                <td
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: colors.success
                  }}
                >
                  {Number(row.revenue || 0).toLocaleString()}원
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  };

  const renderTimeSalesTable = () => {
    const entries = Object.entries(timeStats)
      .map(([key, value]) => ({
        period: key,
        ...value
      }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));

    return (
      <div style={{ overflowX: 'auto', marginTop: '20px' }}>
        <table
          style={{
            width: '100%',
            minWidth: '800px',
            borderCollapse: 'collapse',
            backgroundColor: colors.surface,
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <thead>
            <tr style={{ backgroundColor: colors.primary, color: '#000' }}>
              <th style={{ padding: '12px', textAlign: 'left' }}>기간</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>주문 건수</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>상품 합계</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>사용 포인트</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>실제 매출</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>적립 포인트</th>
            </tr>
          </thead>

          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: colors.textDim
                  }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              entries.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: `1px solid ${colors.border}`
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>
                    {row.period}
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {Number(row.count || 0).toLocaleString()}건
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {Number(row.subtotalRevenue || 0).toLocaleString()}원
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right', color: colors.danger }}>
                    -{Number(row.usedPoints || 0).toLocaleString()} P
                  </td>

                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      color: colors.success,
                      fontWeight: 'bold'
                    }}
                  >
                    {Number(row.revenue || 0).toLocaleString()}원
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right', color: colors.primary }}>
                    {Number(row.earnedPoints || 0).toLocaleString()} P
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCustomerPointTable = () => {
    const entries = Object.values(customerStats).sort((a, b) => {
      return Number(b.revenue || 0) - Number(a.revenue || 0);
    });

    return (
      <div style={{ overflowX: 'auto', marginTop: '20px' }}>
        <table
          style={{
            width: '100%',
            minWidth: '900px',
            borderCollapse: 'collapse',
            backgroundColor: colors.surface,
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <thead>
            <tr style={{ backgroundColor: colors.primary, color: '#000' }}>
              <th style={{ padding: '12px', textAlign: 'left' }}>주문자</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>주문 건수</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>상품 합계</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>실제 결제액</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>기간 내 적립</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>기간 내 사용</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>현재 잔여 포인트</th>
            </tr>
          </thead>

          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: colors.textDim
                  }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              entries.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: `1px solid ${colors.border}`
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>
                    {row.phone}
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {Number(row.count || 0).toLocaleString()}건
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {Number(row.subtotalRevenue || 0).toLocaleString()}원
                  </td>

                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      fontWeight: 'bold',
                      color: colors.success
                    }}
                  >
                    {Number(row.revenue || 0).toLocaleString()}원
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right', color: colors.primary, fontWeight: 'bold' }}>
                    {Number(row.totalEarnedPoints || 0).toLocaleString()} P
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right', color: colors.danger, fontWeight: 'bold' }}>
                    {Number(row.totalUsedPoints || 0).toLocaleString()} P
                  </td>

                  <td style={{ padding: '12px', textAlign: 'right', color: colors.text, fontWeight: 'bold' }}>
                    {Number(row.remainingPoints || 0).toLocaleString()} P
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAmountPeriodTable = () => {
    const entries = Object.values(amountPeriodStats).sort((a, b) => {
      return a.period < b.period ? 1 : -1;
    });

    return (
      <div>
        <div
          style={{
            color: colors.textDim,
            marginBottom: '10px',
            fontSize: '14px'
          }}
        >
          집계 단위: {getGroupLabel(amountGroupBy)}
        </div>

        {renderGroupButtons(amountGroupBy, setAmountGroupBy)}

        <div style={{ overflowX: 'auto', marginTop: '20px' }}>
          <table
            style={{
              width: '100%',
              minWidth: '1050px',
              borderCollapse: 'collapse',
              backgroundColor: colors.surface,
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: colors.primary, color: '#000' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>기간</th>

                {amountBandLabels.map(label => (
                  <th
                    key={label}
                    style={{
                      padding: '12px',
                      textAlign: 'right'
                    }}
                  >
                    {label}
                  </th>
                ))}

                <th style={{ padding: '12px', textAlign: 'right' }}>총 주문</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>총 매출</th>
              </tr>
            </thead>

            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: colors.textDim
                    }}
                  >
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                entries.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: `1px solid ${colors.border}`
                    }}
                  >
                    <td
                      style={{
                        padding: '12px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {row.period}
                    </td>

                    {amountBandLabels.map(label => {
                      const band = row.bands[label] || {
                        count: 0,
                        revenue: 0
                      };

                      return (
                        <td
                          key={label}
                          style={{
                            padding: '12px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                            color: Number(band.count || 0) > 0 ? colors.text : colors.textDim
                          }}
                        >
                          <div style={{ fontWeight: 'bold' }}>
                            {Number(band.count || 0).toLocaleString()}건
                          </div>

                          <div
                            style={{
                              fontSize: '12px',
                              color: Number(band.revenue || 0) > 0 ? colors.success : colors.textDim,
                              marginTop: '3px'
                            }}
                          >
                            {Number(band.revenue || 0).toLocaleString()}원
                          </div>
                        </td>
                      );
                    })}

                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {Number(row.totalCount || 0).toLocaleString()}건
                    </td>

                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: colors.success,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {Number(row.totalRevenue || 0).toLocaleString()}원
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p
          style={{
            marginTop: '12px',
            fontSize: '13px',
            color: colors.textDim,
            lineHeight: '1.5'
          }}
        >
          ※ 결제 액수별 통계는 지정한 기간 안의 제조 완료 주문 기준이며, 포인트 사용 후 실제 결제 금액으로 분류됩니다.
        </p>
      </div>
    );
  };

  // ==========================================
  // 화면 출력
  // ==========================================

  return (
    <div>
      <h3
        style={{
          color: colors.primary,
          marginBottom: '20px'
        }}
      >
        상세 통계
      </h3>

      {renderDateRangeControl()}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '14px'
          }}
        >
          <div style={{ color: colors.textDim, fontSize: '13px' }}>
            제조 완료 주문
          </div>
          <div style={{ color: colors.primary, fontSize: '24px', fontWeight: 'bold' }}>
            {summaryStats.completedOrderCount.toLocaleString()}건
          </div>
        </div>

        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '14px'
          }}
        >
          <div style={{ color: colors.textDim, fontSize: '13px' }}>
            실제 매출
          </div>
          <div style={{ color: colors.success, fontSize: '24px', fontWeight: 'bold' }}>
            {summaryStats.totalRevenue.toLocaleString()}원
          </div>
        </div>

        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '14px'
          }}
        >
          <div style={{ color: colors.textDim, fontSize: '13px' }}>
            사용 포인트
          </div>
          <div style={{ color: colors.danger, fontSize: '24px', fontWeight: 'bold' }}>
            {summaryStats.totalUsedPoints.toLocaleString()} P
          </div>
        </div>

        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '14px'
          }}
        >
          <div style={{ color: colors.textDim, fontSize: '13px' }}>
            적립 포인트
          </div>
          <div style={{ color: colors.primary, fontSize: '24px', fontWeight: 'bold' }}>
            {summaryStats.totalEarnedPoints.toLocaleString()} P
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          overflowX: 'auto',
          paddingBottom: '10px'
        }}
      >
        <button
          onClick={() => setStatTab('time')}
          style={getSubTabStyle('time')}
        >
          기간별 매출
        </button>

        <button
          onClick={() => setStatTab('category')}
          style={getSubTabStyle('category')}
        >
          카테고리별
        </button>

        <button
          onClick={() => setStatTab('item')}
          style={getSubTabStyle('item')}
        >
          품목별
        </button>

        <button
          onClick={() => setStatTab('customer')}
          style={getSubTabStyle('customer')}
        >
          주문자별
        </button>

        <button
          onClick={() => setStatTab('amount')}
          style={getSubTabStyle('amount')}
        >
          결제 액수별
        </button>
      </div>

      <div
        style={{
          backgroundColor: colors.bg,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${colors.border}`
        }}
      >
        {statTab === 'time' && (
          <div>
            <div
              style={{
                color: colors.textDim,
                marginBottom: '10px',
                fontSize: '14px'
              }}
            >
              지정 기간: {dateRangeLabel()} / 집계 단위: {getGroupLabel(timeGroupBy)}
            </div>

            {renderGroupButtons(timeGroupBy, setTimeGroupBy)}

            {renderTimeSalesTable()}
          </div>
        )}

        {statTab === 'category' && (
          <div>
            <div
              style={{
                color: colors.textDim,
                marginBottom: '10px',
                fontSize: '14px'
              }}
            >
              지정 기간: {dateRangeLabel()}
            </div>

            {renderBasicTable(categoryStats, '카테고리명', '판매 수량', '매출액')}
          </div>
        )}

        {statTab === 'item' && (
          <div>
            <div
              style={{
                color: colors.textDim,
                marginBottom: '10px',
                fontSize: '14px'
              }}
            >
              지정 기간: {dateRangeLabel()}
            </div>

            {renderBasicTable(itemStats, '품목명', '판매 수량', '매출액')}
          </div>
        )}

        {statTab === 'customer' && (
          <div>
            <div
              style={{
                color: colors.textDim,
                marginBottom: '10px',
                fontSize: '14px'
              }}
            >
              지정 기간: {dateRangeLabel()}
            </div>

            {renderCustomerPointTable()}
          </div>
        )}

        {statTab === 'amount' && (
          <div>
            <div
              style={{
                color: colors.textDim,
                marginBottom: '10px',
                fontSize: '14px'
              }}
            >
              지정 기간: {dateRangeLabel()}
            </div>

            {renderAmountPeriodTable()}
          </div>
        )}
      </div>
    </div>
  );
}
