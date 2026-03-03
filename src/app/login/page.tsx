"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import Image from "next/image"
import { medplum } from "@/lib/medplum"


export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    try {
      const res = await medplum.startLogin({
        email,
        password,
        scope: "openid offline_access",
      })

      // if we get a code, that means login succeeded
      if (res.code) {
        await medplum.processCode(res.code) // fetches token + stores it internally
        router.replace("/")
        return
      }

      // if no code came back, credentials or org setup is incomplete
      throw new Error("Login response did not include authorization code.")
    } catch (err: any) {
      console.error("Login error:", err)
      setError(err?.message || "Login failed. Check credentials or auth config.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image src="ozryn.svg" alt="OZRYN Logo" width={200} height={200} />
          <p className="text-sm text-muted-foreground text-center">Health Operating System</p>
        </div>

        <Card className="p-6 md:p-8 border border-border/40 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-1">Sign In</h2>
            <p className="text-sm text-muted-foreground">Clinical access to precision health management</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</label>
              <Input id="email" type="email" placeholder="doctor@hospital.com" value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-10 bg-input border-border/60"
                disabled={isLoading} autoComplete="username" />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <Input id="password" type="password" placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)} className="h-10 bg-input border-border/60"
                disabled={isLoading} autoComplete="current-password" />
            </div>

            <Button type="submit" className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium" disabled={isLoading}>
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            <Link href="#" className="block text-primary hover:text-primary/80 transition-colors">Forgot Password?</Link>
            <p className="text-muted-foreground">
              Don't have access?{" "}
              <Link href="#" className="text-primary hover:text-primary/80 transition-colors font-medium">Request Access</Link>
            </p>
          </div>
        </Card>

        <div className="mt-6 p-4 rounded-md bg-muted/30 border border-border/40">
          <p className="text-xs text-muted-foreground text-center">
            HIPAA-compliant access. All connections are encrypted. For clinical use only.
          </p>
        </div>
      </div>
    </div>
  )
}
