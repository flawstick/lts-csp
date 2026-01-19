"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Building2, Key, Eye, EyeOff } from "@/lib/icons"

interface Organisation {
  id: string
  name: string
  slug: string
}

interface Jurisdiction {
  id: string
  code: string
  name: string
  country: string | null
  portalUrl: string | null
}

interface JurisdictionSetting {
  jurisdictionId: string
  username: string
  password: string
}

export default function ClientOrgSettingsPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [org, setOrg] = useState<Organisation | null>(null)
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [credentials, setCredentials] = useState<Record<string, JurisdictionSetting>>({})
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (slug) {
      fetchData()
    }
  }, [slug])

  async function fetchData() {
    setIsLoading(true)
    try {
      // Fetch organization by slug
      const orgsRes = await fetch("/api/organisations")
      if (orgsRes.ok) {
        const orgs = await orgsRes.json()
        const found = orgs.find((o: Organisation) => o.slug === slug)
        if (found) {
          setOrg(found)

          // Fetch jurisdictions
          const jurisdictionsRes = await fetch("/api/jurisdictions")
          if (jurisdictionsRes.ok) {
            const jurisdictionsData = await jurisdictionsRes.json()
            setJurisdictions(jurisdictionsData)

            // Fetch jurisdiction settings for this org
            const settingsRes = await fetch(`/api/organisations/${found.id}/jurisdiction-settings`)
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json()
              const credMap: Record<string, JurisdictionSetting> = {}
              settingsData.forEach((setting: any) => {
                credMap[setting.jurisdictionId] = {
                  jurisdictionId: setting.jurisdictionId,
                  username: setting.credentials?.username || "",
                  password: setting.credentials?.password || "",
                }
              })
              setCredentials(credMap)
            }
          }
        } else {
          setError("Organization not found")
        }
      } else if (orgsRes.status === 403) {
        setError("Only global admins can manage organization settings")
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
      setError("Failed to load organization settings")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(jurisdictionId: string) {
    if (!org) return
    setIsSaving(jurisdictionId)
    setError(null)

    try {
      const cred = credentials[jurisdictionId] || {
        jurisdictionId,
        username: "",
        password: "",
      }

      const res = await fetch(`/api/organisations/${org.id}/jurisdiction-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdictionId,
          credentials: {
            username: cred.username,
            password: cred.password,
          },
        }),
      })

      if (res.ok) {
        // Success feedback
        setTimeout(() => setIsSaving(null), 1000)
      } else {
        const data = await res.json()
        setError(data.error || "Failed to save credentials")
        setIsSaving(null)
      }
    } catch (error) {
      console.error("Failed to save credentials:", error)
      setError("Failed to save credentials")
      setIsSaving(null)
    }
  }

  function updateCredential(jurisdictionId: string, field: "username" | "password", value: string) {
    setCredentials(prev => ({
      ...prev,
      [jurisdictionId]: {
        ...(prev[jurisdictionId] || { jurisdictionId, username: "", password: "" }),
        [field]: value,
      },
    }))
  }

  function togglePasswordVisibility(jurisdictionId: string) {
    setShowPassword(prev => ({
      ...prev,
      [jurisdictionId]: !prev[jurisdictionId],
    }))
  }

  if (isLoading) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Skeleton className="h-4 w-48" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  if (error || !org) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Client Org Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <AlertCircle className="text-muted-foreground h-12 w-12" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/settings">Client Organizations</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{org.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">{org.name}</h1>
            <p className="text-muted-foreground text-sm">
              Configure jurisdiction credentials for this client organization
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Jurisdiction Credentials</CardTitle>
            <CardDescription>
              Portal login credentials for each tax jurisdiction
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {jurisdictions.map((jurisdiction) => {
              const cred = credentials[jurisdiction.id] || {
                jurisdictionId: jurisdiction.id,
                username: "",
                password: "",
              }
              const saving = isSaving === jurisdiction.id

              return (
                <div key={jurisdiction.id} className="space-y-4 pb-6 border-b last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{jurisdiction.name}</h3>
                        <Badge variant="outline">{jurisdiction.code}</Badge>
                      </div>
                      {jurisdiction.portalUrl && (
                        <a
                          href={jurisdiction.portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {jurisdiction.portalUrl}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`username-${jurisdiction.id}`}>Portal Username</Label>
                      <Input
                        id={`username-${jurisdiction.id}`}
                        placeholder="username"
                        value={cred.username}
                        onChange={(e) => updateCredential(jurisdiction.id, "username", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`password-${jurisdiction.id}`}>Portal Password</Label>
                      <div className="relative">
                        <Input
                          id={`password-${jurisdiction.id}`}
                          type={showPassword[jurisdiction.id] ? "text" : "password"}
                          placeholder="password"
                          value={cred.password}
                          onChange={(e) => updateCredential(jurisdiction.id, "password", e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(jurisdiction.id)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword[jurisdiction.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleSave(jurisdiction.id)}
                    disabled={saving || (!cred.username && !cred.password)}
                  >
                    {saving ? "Saving..." : "Save Credentials"}
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
