"use client"

import * as React from "react"
import { useSession } from "@/hooks/use-session"
import { MainLayout } from "@/components/layout/main-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  Shield,
  Bell,
  Database,
  Mail,
  Smartphone,
  Globe,
  Lock,
  Save,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const settings = {
  general: {
    appName: "ACA TicketOps",
    orgName: "Andhra Cricket Association",
    timezone: "Asia/Kolkata",
    language: "en-IN",
    dateFormat: "DD/MM/YYYY",
    currency: "INR",
  },
  security: {
    sessionTimeout: 24,
    passwordMinLength: 8,
    requireMfaForAdmin: true,
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    passwordExpiryDays: 90,
  },
  notifications: {
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: false,
    inAppEnabled: true,
    emailProvider: "SMTP",
    smsProvider: "Twilio",
    whatsappProvider: "Meta",
  },
  integrations: {
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpUser: "noreply@aca.gov.in",
    smtpFrom: "ACA TicketOps <noreply@aca.gov.in>",
    twilioSid: "",
    twilioToken: "",
    twilioFrom: "",
    whatsappToken: "",
    whatsappVerify: "",
    s3Endpoint: "https://s3.example.com",
    s3Bucket: "aca-ticketops",
    s3Region: "auto",
  },
  features: {
    enableBulkImport: true,
    enableBulkExport: true,
    enableApprovals: true,
    enableQuotas: true,
    enableAllocations: true,
    enableDistribution: true,
    enableAudit: true,
    enableReports: true,
  },
}

export default function AdminSettingsPage() {
  const { user, loading } = useSession()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = React.useState("general")
  const [formData, setFormData] = React.useState(settings)
  const [saving, setSaving] = React.useState(false)

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    )
  }

  const handleChange = (section: string, field: string, value: string | boolean | number) => {
    setFormData(prev => ({
      ...prev,
      [section]: { ...prev[section as keyof typeof settings], [field]: value }
    }))
  }

  const handleSave = async (section: string) => {
    setSaving(true)
    try {
      // In real app, call API
      await new Promise(r => setTimeout(r, 500))
      toast({
        title: "Settings saved",
        description: `${section} settings have been updated successfully`,
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
            <p className="text-muted-foreground">Configure application settings and integrations</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">
              <Globe className="h-4 w-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Database className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="features">
              <Settings className="h-4 w-4 mr-2" />
              Features
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Basic application configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="appName">Application Name</Label>
                    <Input
                      id="appName"
                      value={formData.general.appName}
                      onChange={(e) => handleChange("general", "appName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Organization Name</Label>
                    <Input
                      id="orgName"
                      value={formData.general.orgName}
                      onChange={(e) => handleChange("general", "orgName", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <select
                      id="timezone"
                      value={formData.general.timezone}
                      onChange={(e) => handleChange("general", "timezone", e.target.value)}
                      className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="Europe/London">Europe/London</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <select
                      id="language"
                      value={formData.general.language}
                      onChange={(e) => handleChange("general", "language", e.target.value)}
                      className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="en-IN">English (India)</option>
                      <option value="en-US">English (US)</option>
                      <option value="hi-IN">Hindi (India)</option>
                      <option value="te-IN">Telugu (India)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Input
                      id="dateFormat"
                      value={formData.general.dateFormat}
                      onChange={(e) => handleChange("general", "dateFormat", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      value={formData.general.currency}
                      onChange={(e) => handleChange("general", "currency", e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={() => handleSave("general")} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save General Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Authentication and access control policies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sessionTimeout">Session Timeout (hours)</Label>
                    <Input
                      id="sessionTimeout"
                      type="number"
                      min="1"
                      max="168"
                      value={formData.security.sessionTimeout}
                      onChange={(e) => handleChange("security", "sessionTimeout", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
                    <Input
                      id="passwordMinLength"
                      type="number"
                      min="6"
                      max="32"
                      value={formData.security.passwordMinLength}
                      onChange={(e) => handleChange("security", "passwordMinLength", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                    <Input
                      id="maxLoginAttempts"
                      type="number"
                      min="3"
                      max="20"
                      value={formData.security.maxLoginAttempts}
                      onChange={(e) => handleChange("security", "maxLoginAttempts", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lockoutDuration">Lockout Duration (minutes)</Label>
                    <Input
                      id="lockoutDuration"
                      type="number"
                      min="5"
                      max="1440"
                      value={formData.security.lockoutDuration}
                      onChange={(e) => handleChange("security", "lockoutDuration", parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passwordExpiryDays">Password Expiry (days)</Label>
                    <Input
                      id="passwordExpiryDays"
                      type="number"
                      min="0"
                      max="365"
                      value={formData.security.passwordExpiryDays}
                      onChange={(e) => handleChange("security", "passwordExpiryDays", parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">MFA Requirements</h4>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Require MFA for Admin Users</p>
                      <p className="text-sm text-muted-foreground">Enforce multi-factor authentication for users with admin roles</p>
                    </div>
                    <Switch
                      checked={formData.security.requireMfaForAdmin}
                      onCheckedChange={(checked) => handleChange("security", "requireMfaForAdmin", checked)}
                    />
                  </div>
                </div>

                <Button onClick={() => handleSave("security")} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Security Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Configure notification channels and providers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">Enabled Channels</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-muted-foreground">Send notifications via email</p>
                      </div>
                      <Switch
                        checked={formData.notifications.emailEnabled}
                        onCheckedChange={(checked) => handleChange("notifications", "emailEnabled", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">SMS Notifications</p>
                        <p className="text-sm text-muted-foreground">Send notifications via SMS</p>
                      </div>
                      <Switch
                        checked={formData.notifications.smsEnabled}
                        onCheckedChange={(checked) => handleChange("notifications", "smsEnabled", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">WhatsApp Notifications</p>
                        <p className="text-sm text-muted-foreground">Send notifications via WhatsApp Business</p>
                      </div>
                      <Switch
                        checked={formData.notifications.whatsappEnabled}
                        onCheckedChange={(checked) => handleChange("notifications", "whatsappEnabled", checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">In-App Notifications</p>
                        <p className="text-sm text-muted-foreground">Show notifications within the application</p>
                      </div>
                      <Switch
                        checked={formData.notifications.inAppEnabled}
                        onCheckedChange={(checked) => handleChange("notifications", "inAppEnabled", checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold">Providers</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email Provider</Label>
                      <select
                        value={formData.notifications.emailProvider}
                        onChange={(e) => handleChange("notifications", "emailProvider", e.target.value)}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="SMTP">SMTP</option>
                        <option value="SendGrid">SendGrid</option>
                        <option value="Mailgun">Mailgun</option>
                        <option value="SES">Amazon SES</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>SMS Provider</Label>
                      <select
                        value={formData.notifications.smsProvider}
                        onChange={(e) => handleChange("notifications", "smsProvider", e.target.value)}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="Twilio">Twilio</option>
                        <option value="MSG91">MSG91</option>
                        <option value="TextLocal">TextLocal</option>
                        <option value="Exotel">Exotel</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>WhatsApp Provider</Label>
                      <select
                        value={formData.notifications.whatsappProvider}
                        onChange={(e) => handleChange("notifications", "whatsappProvider", e.target.value)}
                        className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="Meta">Meta (Official)</option>
                        <option value="Twilio">Twilio WhatsApp</option>
                        <option value="Gupshup">Gupshup</option>
                      </select>
                    </div>
                  </div>
                </div>

                <Button onClick={() => handleSave("notifications")} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Integration Settings</CardTitle>
                <CardDescription>External service configurations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email (SMTP)
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="smtpHost">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        value={formData.integrations.smtpHost}
                        onChange={(e) => handleChange("integrations", "smtpHost", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPort">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        value={formData.integrations.smtpPort}
                        onChange={(e) => handleChange("integrations", "smtpPort", parseInt(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpUser">SMTP Username</Label>
                      <Input
                        id="smtpUser"
                        type="email"
                        value={formData.integrations.smtpUser}
                        onChange={(e) => handleChange("integrations", "smtpUser", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPassword">SMTP Password</Label>
                      <Input
                        id="smtpPassword"
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) => handleChange("integrations", "smtpPassword", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="smtpFrom">From Address</Label>
                      <Input
                        id="smtpFrom"
                        value={formData.integrations.smtpFrom}
                        onChange={(e) => handleChange("integrations", "smtpFrom", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 border-t pt-6">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    SMS (Twilio)
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="twilioSid">Account SID</Label>
                      <Input
                        id="twilioSid"
                        value={formData.integrations.twilioSid}
                        onChange={(e) => handleChange("integrations", "twilioSid", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twilioToken">Auth Token</Label>
                      <Input
                        id="twilioToken"
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) => handleChange("integrations", "twilioToken", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="twilioFrom">From Number</Label>
                      <Input
                        id="twilioFrom"
                        value={formData.integrations.twilioFrom}
                        onChange={(e) => handleChange("integrations", "twilioFrom", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 border-t pt-6">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    WhatsApp Business
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="whatsappToken">Access Token</Label>
                      <Input
                        id="whatsappToken"
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) => handleChange("integrations", "whatsappToken", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsappVerify">Verify Token</Label>
                      <Input
                        id="whatsappVerify"
                        type="password"
                        placeholder="••••••••"
                        onChange={(e) => handleChange("integrations", "whatsappVerify", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 border-t pt-6">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    File Storage (S3 Compatible)
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="s3Endpoint">Endpoint URL</Label>
                      <Input
                        id="s3Endpoint"
                        value={formData.integrations.s3Endpoint}
                        onChange={(e) => handleChange("integrations", "s3Endpoint", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3Bucket">Bucket Name</Label>
                      <Input
                        id="s3Bucket"
                        value={formData.integrations.s3Bucket}
                        onChange={(e) => handleChange("integrations", "s3Bucket", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3Region">Region</Label>
                      <Input
                        id="s3Region"
                        value={formData.integrations.s3Region}
                        onChange={(e) => handleChange("integrations", "s3Region", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={() => handleSave("integrations")} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Integration Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
                <CardDescription>Enable or disable system features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {Object.entries(formData.features).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</p>
                        <p className="text-sm text-muted-foreground">Controls {key.replace(/([A-Z])/g, ' $1').toLowerCase()} functionality</p>
                      </div>
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) => handleChange("features", key, checked)}
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={() => handleSave("features")} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Feature Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}