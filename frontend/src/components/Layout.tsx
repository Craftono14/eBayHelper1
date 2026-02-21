import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleAuthClick = () => {
    if (user) {
      navigate('/link-ebay');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          {/* Logo */}
          <Link to="/" className="text-2xl font-bold text-blue-600 hover:text-blue-800">
            eBayHelper
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex space-x-6">
            <Link to="/" className="text-gray-700 hover:text-blue-600 font-medium">
              Home
            </Link>
            <Link to="/saved-searches" className="text-gray-700 hover:text-blue-600 font-medium">
              Saved Searches
            </Link>
            <Link to="/feed" className="text-gray-700 hover:text-blue-600 font-medium">
              Feed
            </Link>
            <Link to="/wishlist" className="text-gray-700 hover:text-blue-600 font-medium">
              Wishlist
            </Link>
          </div>

          {/* Auth Button */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-gray-700 font-medium">{user.email}</span>
                <button
                  onClick={handleAuthClick}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition"
                >
                  Link eBay Account
                </button>
                <button
                  onClick={logout}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={handleAuthClick}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Login / Register
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Links */}
        <div className="md:hidden bg-gray-100 px-4 py-2 space-y-2">
          <Link to="/" className="block text-gray-700 hover:text-blue-600 font-medium">
            Home
          </Link>
          <Link to="/saved-searches" className="block text-gray-700 hover:text-blue-600 font-medium">
            Saved Searches
          </Link>
          <Link to="/feed" className="block text-gray-700 hover:text-blue-600 font-medium">
            Feed
          </Link>
          <Link to="/wishlist" className="block text-gray-700 hover:text-blue-600 font-medium">
            Wishlist
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white text-center py-6 mt-12">
        <p>&copy; 2026 eBayHelper. All rights reserved.</p>
      </footer>
    </div>
  );
};
