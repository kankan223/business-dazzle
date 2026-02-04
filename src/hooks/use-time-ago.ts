import { useEffect, useState } from 'react'

export function useTimeAgo(timestamp: string | Date): string {
  const [timeAgo, setTimeAgo] = useState<string>('')

  useEffect(() => {
    const calculateTimeAgo = () => {
      const now = Date.now()
      const past = new Date(timestamp).getTime()
      const diffInMinutes = Math.round((now - past) / 60000)
      setTimeAgo(`${diffInMinutes}m ago`)
    }

    calculateTimeAgo()
    const interval = setInterval(calculateTimeAgo, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [timestamp])

  return timeAgo
}

// Helper function for non-hook usage (in callbacks)
export function getTimeAgo(timestamp: string | Date): string {
  const now = Date.now()
  const past = new Date(timestamp).getTime()
  const diffInMinutes = Math.round((now - past) / 60000)
  return `${diffInMinutes}m ago`
}
