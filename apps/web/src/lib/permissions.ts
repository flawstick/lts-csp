export type OrgRole = "owner" | "admin" | "member"

// Global admins bypass all permission checks
export function isGlobalAdmin(isAdmin: boolean): boolean {
  return isAdmin
}

export const PERMISSIONS = {
  // Org settings - only owner and admin
  "org:settings:read": ["owner", "admin", "member"],
  "org:settings:edit": ["owner", "admin"],

  // Members management
  "org:members:read": ["owner", "admin", "member"],
  "org:members:invite": ["owner", "admin"],
  "org:members:remove": ["owner", "admin"],
  "org:members:edit-role": ["owner"],

  // Billing
  "org:billing:read": ["owner", "admin"],
  "org:billing:edit": ["owner"],

  // Platform features - all members
  "returns:read": ["owner", "admin", "member"],
  "returns:create": ["owner", "admin", "member"],
  "returns:edit": ["owner", "admin", "member"],
  "tasks:read": ["owner", "admin", "member"],
  "tasks:create": ["owner", "admin", "member"],
  "tasks:run": ["owner", "admin", "member"],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly string[]
  return allowedRoles.includes(role)
}

export function canEditOrgSettings(role: OrgRole): boolean {
  return hasPermission(role, "org:settings:edit")
}

export function canManageMembers(role: OrgRole): boolean {
  return hasPermission(role, "org:members:invite")
}

export function canEditMemberRoles(role: OrgRole): boolean {
  return hasPermission(role, "org:members:edit-role")
}

export function canAccessBilling(role: OrgRole): boolean {
  return hasPermission(role, "org:billing:read")
}

export function canEditBilling(role: OrgRole): boolean {
  return hasPermission(role, "org:billing:edit")
}

export function getRoleLabel(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "Owner"
    case "admin":
      return "Admin"
    case "member":
      return "Member"
    default:
      return "Unknown"
  }
}

export function getRoleDescription(role: OrgRole): string {
  switch (role) {
    case "owner":
      return "Full access to all features including billing and member role management"
    case "admin":
      return "Can manage members and org settings, but cannot change billing or promote to owner"
    case "member":
      return "Can access platform features but cannot modify organisation settings"
    default:
      return ""
  }
}
