// src/App.jsx
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { colors } from './utils/theme';

import CustomerApp from './components/CustomerApp';
import ManagerApp from './components/ManagerApp';
import DisplayApp from './components/DisplayApp';
import ManufactureApp from './components/manufactureapp.jsx';

const DEFAULT_MENU_LIST = []; 

export default function App() {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'menus'), (snap) => {
      if (snap.empty && DEFAULT_MENU_LIST.length > 0) {
        DEFAULT_MENU_LIST.forEach(async (m) => await addDoc(collection(db, 'menus'), m));
      } else {
        const arr = []; 
        snap.forEach(d => arr.push({ id: d.id, ...d.data() })); 
        setMenus(arr);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: colors.bg,
          color: '#FFFFFF',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        로딩중...
      </div>
    );
  }

  const path = window.location.pathname.toLowerCase();
  
  if (path === '/manager') return <ManagerApp menus={menus} />;
  if (path === '/display') return <DisplayApp />;
  if (path === '/manufacture') return <ManufactureApp />;
  
  return <CustomerApp menus={menus} />;
}
