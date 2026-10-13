import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { DashboardPage } from '@/pages/photographer/DashboardPage'
import { OrdersPage } from '@/pages/photographer/OrdersPage'
import { OrderDetailPage } from '@/pages/photographer/OrderDetailPage'
import { UploadPage } from '@/pages/photographer/UploadPage'
import { AnalysisResultPage } from '@/pages/photographer/AnalysisResultPage'
import { RetouchPage } from '@/pages/photographer/RetouchPage'
import { ClientPage } from '@/pages/client/ClientPage'
import { BookingPage } from '@/pages/client/BookingPage'
import { BookingDetailPage } from '@/pages/BookingDetailPage'
import { SelectionPage } from '@/pages/client/SelectionPage'
import { DeliveryPage } from '@/pages/client/DeliveryPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route
            path="/bookings/:id"
            element={
              <ProtectedRoute>
                <BookingDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrdersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <OrderDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/analysis"
            element={
              <ProtectedRoute>
                <AnalysisResultPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/retouch"
            element={
              <ProtectedRoute>
                <RetouchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/selection"
            element={
              <ProtectedRoute>
                <SelectionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id/delivery"
            element={
              <ProtectedRoute>
                <DeliveryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client"
            element={
              <ProtectedRoute>
                <ClientPage />
              </ProtectedRoute>
            }
          />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
