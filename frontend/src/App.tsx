import { lazy, Suspense } from 'react'
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { DashboardPage } from '@/pages/photographer/DashboardPage'
import { OrdersPage } from '@/pages/photographer/OrdersPage'
import { OrderDetailPage } from '@/pages/photographer/OrderDetailPage'
import { UploadPage } from '@/pages/photographer/UploadPage'
import { LoadingState } from '@/components/ui'
import { AnalysisResultPage } from '@/pages/photographer/AnalysisResultPage'
import { RetouchPage } from '@/pages/photographer/RetouchPage'
import { ClientPage } from '@/pages/client/ClientPage'
import { BookingPage } from '@/pages/client/BookingPage'
import { BookingDetailPage } from '@/pages/BookingDetailPage'
import { SelectionPage } from '@/pages/client/SelectionPage'
import { DeliveryPage } from '@/pages/client/DeliveryPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LandingPage } from '@/pages/LandingPage'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ToastViewport } from '@/components/ui/Toast'
import { useCardCursorGlow } from '@/components/effects/useCardCursorGlow'
import { MaterialScope } from '@/components/material/MaterialScope'

const queryClient = new QueryClient()
const PhotoLibraryPage = lazy(() => import('@/pages/photographer/PhotoLibraryPage').then(module => ({ default: module.PhotoLibraryPage })))
const PhotoEditorPage = lazy(() => import('@/pages/photographer/PhotoEditorPage').then(module => ({ default: module.PhotoEditorPage })))
const LightTablePage = lazy(() => import('@/pages/photographer/LightTablePage').then(module => ({ default: module.LightTablePage })))
const router = createBrowserRouter(createRoutesFromElements(<>

          <Route path="/" element={<LandingPage />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
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
            path="/dashboard"
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
          <Route path="/orders/:id/library" element={<ProtectedRoute><Suspense fallback={<LoadingState label="正在加载照片图库" />}><PhotoLibraryPage /></Suspense></ProtectedRoute>}/>
          <Route path="/orders/:id/light-table" element={<ProtectedRoute><Suspense fallback={<LoadingState label="正在加载灯箱" />}><LightTablePage /></Suspense></ProtectedRoute>}/>
          <Route
            path="/orders/:id/photos/:photoId/edit"
            element={<ProtectedRoute><Suspense fallback={<LoadingState label="正在加载修图工作台" />}><PhotoEditorPage /></Suspense></ProtectedRoute>}
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

</>))

function App() {
  const cursorGlowRef = useCardCursorGlow<HTMLDivElement>(true)
  return (
    <QueryClientProvider client={queryClient}>
      <MaterialScope><div ref={cursorGlowRef} style={{display:'contents'}}>
      <RouterProvider router={router} />
      <ToastViewport />
      </div></MaterialScope>
    </QueryClientProvider>
  )
}

export default App
