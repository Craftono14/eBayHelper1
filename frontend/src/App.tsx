import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { SavedSearches } from './pages/SavedSearches';
import { Feed } from './pages/Feed';
import { Wishlist } from './pages/Wishlist';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { LinkEbay } from './pages/LinkEbay';
import { Tests } from './pages/Tests';
import EbayCallback from './pages/EbayCallback';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/saved-searches" element={<SavedSearches />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/link-ebay" element={<LinkEbay />} />
            <Route path="/tests" element={<Tests />} />
            <Route path="/ebay-callback" element={<EbayCallback />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </Router>
  );
}

export default App;
