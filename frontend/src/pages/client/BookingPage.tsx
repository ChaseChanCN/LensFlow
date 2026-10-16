import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBooking, type Booking } from '@/api/bookings'
import { extractErrorMessage } from '@/api/auth'
import { Layout } from '@/components/Layout'
import { LargeTitle, Button, Input, Select, Textarea } from '@/components/ui'

export function BookingPage() {
  const navigate = useNavigate()
  const [shootType, setShootType] = useState('wedding')
  const [contactInfo, setContactInfo] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [location, setLocation] = useState('')
  const [durationHours, setDurationHours] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(redirectTimer.current), [])

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
        location: location || undefined,
        duration_hours: durationHours ? Number(durationHours) : undefined,
        note: note || undefined,
      })
      setSuccess(booking)
      setContactInfo('')
      setPreferredDate('')
      setLocation('')
      setDurationHours('')
      setNote('')
      redirectTimer.current = setTimeout(() => navigate('/client'), 1500)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout title="LensFlow">
      <LargeTitle title="提交预约" subtitle="填写拍摄需求，摄影师将尽快确认" />

      {success && (
        <div role="status" className="mx-4 mb-2 rounded-card bg-success-bg px-4 py-3 text-body-sm text-success-label">
          预约已提交，编号 #{success.id}，等待摄影师确认，即将返回...
        </div>
      )}
      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-card bg-error-bg px-4 py-3 text-body-sm text-error-label">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="px-4">
          <div className="overflow-hidden rounded-card bg-system-bg shadow-card">
            <div className="border-b border-separator-opaque p-4">
              <Select
                aria-label="拍摄类型" name="shootType"
                value={shootType}
                onChange={(e) => setShootType(e.target.value)}
                variant="grouped"
              >
                <option value="wedding">婚纱摄影</option>
                <option value="portrait">人像写真</option>
                <option value="family">家庭合影</option>
                <option value="product">产品摄影</option>
                <option value="event">活动记录</option>
              </Select>
            </div>
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="date" label="期望日期"
                aria-label="期望日期" name="preferredDate"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                placeholder="期望日期"
                variant="grouped"
              />
            </div>
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="text"
                aria-label="拍摄地点" name="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="拍摄地点"
                variant="grouped"
              />
            </div>
            <div className="border-b border-separator-opaque p-4">
              <Input
                type="number"
                step="0.5"
                min="0.5"
                aria-label="拍摄时长（小时）" name="durationHours"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="拍摄时长（小时）"
                variant="grouped"
              />
            </div>
            <div className="p-4">
              <Input
                type="text"
                aria-label="联系方式" name="contactInfo"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="联系方式（手机号或邮箱）"
                required
                variant="grouped"
              />
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <Textarea
            aria-label="备注" name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="特殊需求或备注说明"
            rows={3}
          />
        </div>

        <div className="px-4 pt-4">
          <Button type="submit" fullWidth size="lg" loading={loading} disabled={!!success}>
            提交预约
          </Button>
        </div>
      </form>
    </Layout>
  )
}
