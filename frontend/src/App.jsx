import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/Upload';
import EditorPage from './pages/Editor';
import './index.css';

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<UploadPage />} />
                <Route path="/editor/:id" element={<EditorPage />} />
            </Routes>
        </BrowserRouter>
    );
}
