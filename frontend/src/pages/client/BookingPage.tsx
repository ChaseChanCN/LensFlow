import { useState } from 'react'
import { createBooking, type Booking } from '@/api/bookings'
import { extractErrorMessage } from '@/api/auth'

export function BookingPage() {
  const [shootType, setShootType] = useState('wedding')
  const [contactInfo, setContactInfo] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(null)
    setLoading(true)
    try {
      const booking = await createBooking({
        shoot_type: shootType,
        contact_info: contactInfo,
        preferred_date: preferredDate || undefined,
        note: note || undefined,
      })
      setSuccess(booking)
      setContactInfo('')
      setPreferredDate('')
      setNote('')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">LensFlow</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="text-lg font-medium">提交预约</h2>
        <p className="mt-1 text-sm text-gray-400">填写拍摄需求，摄影师将尽快确认</p>

        {success && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            预约已提交，编号 #{success.id}，等待摄影师确认
          </div>
        )}
        {error && (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="shoot-type" className="mb-1 block text-sm text-gray-600">拍摄类型</label>
            <select
              id="shoot-type"
              value={shootType}
              onChange={(e) => setShootType(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            >
              <option value="wedding">婚纱摄影</option>
              <option value="portrait">人像写真</option>
              <option value="family">家庭合影</option>
              <option value="product">产品摄影</option>
              <option value="event">活动记录</option>
            </select>
          </div>
          <div>
            <label htmlFor="preferred-date" className="mb-1 block text-sm text-gray-600">期望日期</label>
            <input
              id="preferred-date"
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="contact-info" className="mb-1 block text-sm text-gray-600">联系方式</label>
            <input
              id="contact-info"
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              placeholder="手机号或邮箱"
              required
            />
          </div>
          <div>
            <label htmlFor="note" className="mb-1 block text-sm text-gray-600">备注</label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              rows={3}
              placeholder="特殊需求或说明"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black px-6 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? '提交中...' : '提交预约'}
          </button>
        </form>
      </main>
    </div>
  )
}
