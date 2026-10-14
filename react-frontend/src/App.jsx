import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import Chat from './components/Chat';
import { AuthCallback, ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/AuthPages';
import Home from './pages/Home';
import Tasks from './pages/Tasks';
import GitHubPage from './pages/GitHub';
import SettingsPage from './pages/Settings';
import './App.css';

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/register" element={<Register/>}/>
    <Route path="/auth/callback" element={<AuthCallback/>}/>
    <Route path="/verify-email" element={<VerifyEmail/>}/>
    <Route path="/forgot-password" element={<ForgotPassword/>}/>
    <Route path="/reset-password" element={<ResetPassword/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<AppShell/>}>
        <Route index element={<Home/>}/>
        <Route path="tasks" element={<Tasks/>}/>
        <Route path="chat" element={<Chat/>}/>
        <Route path="chat/:conversationId" element={<Chat/>}/>
        <Route path="github" element={<GitHubPage/>}/>
        <Route path="settings" element={<SettingsPage/>}/>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></AuthProvider></BrowserRouter>;
}
