import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { getToken } from './api';
import { ToastProvider } from './ui';
import Layout from './Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Stock from './pages/Stock';
import Receipts, { ReceiptForm } from './pages/Receipts';
import Sales from './pages/Sales';
import Pos from './pages/Pos';
import Labels from './pages/Labels';
import { Warehouses, Channels, Counterparties } from './pages/Refs';
import SettingsPage from './pages/Settings';

const Private = ({ children }) => (getToken() ? children : <Navigate to="/login" replace />);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Private><Layout /></Private>}>
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="sales" element={<Sales />} />
            <Route path="products" element={<Products />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/:id" element={<ProductForm />} />
            <Route path="stock" element={<Stock />} />
            <Route path="receipts" element={<Receipts />} />
            <Route path="receipts/new" element={<ReceiptForm />} />
            <Route path="labels" element={<Labels />} />
            <Route path="warehouses" element={<Warehouses />} />
            <Route path="channels" element={<Channels />} />
            <Route path="counterparties" element={<Counterparties />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
