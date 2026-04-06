'use client'

import type React from 'react'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

import type { AdminLoginConfig } from '@/lib/admin/control-plane'
import { configureAdminMedplum } from '@/lib/admin/medplum'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

async function syncAdminSession(accessToken: string): Promise<void> {
  const response = await fetch('/api/admin/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = await response
    .json()
    .catch(() => ({ error: 'Admin session sync failed.' }))

  if (!response.ok) {
    throw new Error(payload.error || 'Admin session sync failed.')
  }
}

export function AdminLoginForm({
  configured,
  authConfig,
  missingEnvVars,
}: {
  configured: boolean
  authConfig: AdminLoginConfig | null
  missingEnvVars: string[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function syncExistingSession(): Promise<void> {
      if (!configured || !authConfig) {
        return
      }

      const medplum = configureAdminMedplum(authConfig)
      await medplum.refreshIfExpired().catch(() => undefined)
      const accessToken = medplum.getAccessToken()

      if (!accessToken) {
        return
      }

      setIsLoading(true)
      setError('')

      try {
        await syncAdminSession(accessToken)
        if (!cancelled) {
          router.replace('/admin')
          router.refresh()
        }
      } catch {
        medplum.clear()
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void syncExistingSession()

    return () => {
      cancelled = true
    }
  }, [authConfig, configured, router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    if (!authConfig) {
      setError('Missing Medplum admin login configuration.')
      setIsLoading(false)
      return
    }

    const medplum = configureAdminMedplum(authConfig)

    try {
      medplum.clear()

      const response = await medplum.startLogin({
        email,
        password,
        scope: 'openid offline_access',
      })

      if (!response.code) {
        throw new Error('Login response did not include authorization code.')
      }

      await medplum.processCode(response.code)

      const accessToken = medplum.getAccessToken()
      if (!accessToken) {
        throw new Error('Admin login succeeded, but no Medplum access token was available.')
      }

      await syncAdminSession(accessToken)
      router.replace('/admin')
      router.refresh()
    } catch (err) {
      medplum.clear()
      setError(err instanceof Error ? err.message : 'Admin login failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image src="/ozryn.svg" alt="OZRYN Logo" width={200} height={200} />
          <p className="text-sm text-muted-foreground text-center">
            Operator Control Plane
          </p>
        </div>

        <Card className="p-6 md:p-8 border border-border/40 shadow-sm">
          <div className="mb-6 space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Admin Sign In</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with your Medplum operator account for the admin control plane.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!configured ? (
              <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">
                  Missing {missingEnvVars.map((name, index) => (
                    <span key={name}>
                      <code>{name}</code>
                      {index < missingEnvVars.length - 1 ? ', ' : ''}
                    </span>
                  ))}{' '}
                  in `.env.local`. Restart `pnpm dev` after updating env vars.
                </p>
              </div>
            ) : null}

            {error ? (
              <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="admin-email" className="text-sm font-medium text-foreground">
                Email Address
              </label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading || !configured}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="admin-password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <Input
                id="admin-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading || !configured}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !configured}
            >
              {isLoading ? 'Signing In...' : 'Enter Control Plane'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
