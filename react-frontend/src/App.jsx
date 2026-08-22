import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
