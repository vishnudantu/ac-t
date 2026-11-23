// ACA TicketOps - Database Seed Script
// Creates initial data for development and testing

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // ============================================
  // Create Permissions
  // ============================================
  const permissions = [
    // User Management
    { key: 'users:read', displayName: 'Read Users', description: 'View user accounts', category: 'User Management' },
    { key: 'users:write', displayName: 'Write Users', description: 'Create and modify user accounts', category: 'User Management' },
    { key: 'users:delete', displayName: 'Delete Users', description: 'Delete user accounts', category: 'User Management' },
    { key: 'users:assign_roles', displayName: 'Assign Roles', description: 'Assign roles to users', category: 'User Management' },

    // Role Management
    { key: 'roles:read', displayName: 'Read Roles', description: 'View roles', category: 'Role Management' },
    { key: 'roles:write', displayName: 'Write Roles', description: 'Create and modify roles', category: 'Role Management' },
    { key: 'roles:delete', displayName: 'Delete Roles', description: 'Delete roles', category: 'Role Management' },

    // Match Management
    { key: 'matches:read', displayName: 'Read Matches', description: 'View matches', category: 'Match Management' },
    { key: 'matches:write', displayName: 'Write Matches', description: 'Create and modify matches', category: 'Match Management' },
    { key: 'matches:delete', displayName: 'Delete Matches', description: 'Delete matches', category: 'Match Management' },
    { key: 'matches:configure', displayName: 'Configure Matches', description: 'Configure match settings, inventory, quotas', category: 'Match Management' },

    // Request Management
    { key: 'requests:read', displayName: 'Read Requests', description: 'View ticket requests', category: 'Request Management' },
    { key: 'requests:write', displayName: 'Write Requests', description: 'Create and modify requests', category: 'Request Management' },
    { key: 'requests:delete', displayName: 'Delete Requests', description: 'Delete requests', category: 'Request Management' },
    { key: 'requests:assign', displayName: 'Assign Requests', description: 'Assign requests to staff', category: 'Request Management' },
    { key: 'requests:bulk_import', displayName: 'Bulk Import Requests', description: 'Import requests from Excel/CSV', category: 'Request Management' },
    { key: 'requests:export', displayName: 'Export Requests', description: 'Export requests to Excel/CSV/PDF', category: 'Request Management' },

    // Approval Management
    { key: 'approvals:read', displayName: 'Read Approvals', description: 'View approval workflows and decisions', category: 'Approval Management' },
    { key: 'approvals:decide', displayName: 'Decide Approvals', description: 'Approve, reject, or modify requests', category: 'Approval Management' },
    { key: 'approvals:configure', displayName: 'Configure Approvals', description: 'Configure approval workflows', category: 'Approval Management' },
    { key: 'approvals:escalate', displayName: 'Escalate Approvals', description: 'Escalate approvals to higher authorities', category: 'Approval Management' },

    // Inventory Management
    { key: 'inventory:read', displayName: 'Read Inventory', description: 'View ticket inventory', category: 'Inventory Management' },
    { key: 'inventory:write', displayName: 'Write Inventory', description: 'Create and modify inventory', category: 'Inventory Management' },
    { key: 'inventory:import', displayName: 'Import Inventory', description: 'Import inventory from Excel/CSV', category: 'Inventory Management' },
    { key: 'inventory:adjust', displayName: 'Adjust Inventory', description: 'Adjust inventory quantities', category: 'Inventory Management' },

    // Quota Management
    { key: 'quotas:read', displayName: 'Read Quotas', description: 'View quota pools and allocations', category: 'Quota Management' },
    { key: 'quotas:write', displayName: 'Write Quotas', description: 'Create and modify quota pools', category: 'Quota Management' },
    { key: 'quotas:transfer', displayName: 'Transfer Quotas', description: 'Transfer quotas between pools', category: 'Quota Management' },

    // Allocation Management
    { key: 'allocations:read', displayName: 'Read Allocations', description: 'View ticket allocations', category: 'Allocation Management' },
    { key: 'allocations:write', displayName: 'Write Allocations', description: 'Create and modify allocations', category: 'Allocation Management' },
    { key: 'allocations:confirm', displayName: 'Confirm Allocations', description: 'Confirm and lock allocations', category: 'Allocation Management' },
    { key: 'allocations:committee', displayName: 'Allocation Committee', description: 'Access allocation committee mode', category: 'Allocation Management' },

    // Distribution Management
    { key: 'distribution:read', displayName: 'Read Distribution', description: 'View distribution records', category: 'Distribution Management' },
    { key: 'distribution:write', displayName: 'Write Distribution', description: 'Create and modify distribution records', category: 'Distribution Management' },
    { key: 'distribution:issue', displayName: 'Issue Tickets', description: 'Issue tickets to recipients', category: 'Distribution Management' },
    { key: 'distribution:handover', displayName: 'Handover Tickets', description: 'Transfer ticket custody', category: 'Distribution Management' },
    { key: 'distribution:return', displayName: 'Return Tickets', description: 'Process ticket returns', category: 'Distribution Management' },

    // Reports
    { key: 'reports:read', displayName: 'Read Reports', description: 'View reports and dashboards', category: 'Reports' },
    { key: 'reports:export', displayName: 'Export Reports', description: 'Export reports', category: 'Reports' },
    { key: 'reports:reconciliation', displayName: 'Reconciliation Reports', description: 'Access final reconciliation reports', category: 'Reports' },

    // Audit
    { key: 'audit:read', displayName: 'Read Audit Logs', description: 'View audit trails', category: 'Audit' },
    { key: 'audit:export', displayName: 'Export Audit Logs', description: 'Export audit trails', category: 'Audit' },

    // System Settings
    { key: 'settings:read', displayName: 'Read Settings', description: 'View system settings', category: 'System Settings' },
    { key: 'settings:write', displayName: 'Write Settings', description: 'Modify system settings', category: 'System Settings' },

    // Notifications
    { key: 'notifications:read', displayName: 'Read Notifications', description: 'View notification logs', category: 'Notifications' },
    { key: 'notifications:send', displayName: 'Send Notifications', description: 'Send notifications', category: 'Notifications' },
    { key: 'notifications:configure', displayName: 'Configure Notifications', description: 'Configure notification templates', category: 'Notifications' },
  ]

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: perm,
      create: perm,
    })
  }
  console.log('✅ Permissions created')

  // ============================================
  // Create Roles
  // ============================================
  const roles = [
    {
      name: 'SUPER_ADMIN',
      displayName: 'Super Administrator',
      description: 'Full system administration, account management, match configuration and exceptional administrative controls',
      isSystem: true,
      permissions: permissions.map(p => p.key),
    },
    {
      name: 'MATCH_ADMIN',
      displayName: 'Match Administrator',
      description: 'Creates matches, establishes ticket inventory, configures workflows and oversees match operations',
      isSystem: true,
      permissions: [
        'matches:read', 'matches:write', 'matches:configure',
        'requests:read', 'requests:write', 'requests:assign', 'requests:bulk_import', 'requests:export',
        'approvals:read', 'approvals:configure',
        'inventory:read', 'inventory:write', 'inventory:import', 'inventory:adjust',
        'quotas:read', 'quotas:write', 'quotas:transfer',
        'allocations:read', 'allocations:write', 'allocations:confirm', 'allocations:committee',
        'distribution:read', 'distribution:write', 'distribution:issue', 'distribution:handover', 'distribution:return',
        'reports:read', 'reports:export', 'reports:reconciliation',
        'audit:read', 'audit:export',
        'settings:read', 'settings:write',
        'notifications:read', 'notifications:send', 'notifications:configure',
      ],
    },
    {
      name: 'REQUEST_DESK_OPERATOR',
      displayName: 'Request Desk Operator',
      description: 'Records incoming requests, uploads documents, manages requester details and tracks progress',
      isSystem: true,
      permissions: [
        'requests:read', 'requests:write', 'requests:assign', 'requests:bulk_import', 'requests:export',
        'users:read',
        'reports:read',
      ],
    },
    {
      name: 'DEPARTMENT_COORDINATOR',
      displayName: 'Department Coordinator',
      description: 'Manages requests belonging to a particular department or stakeholder group',
      isSystem: true,
      permissions: [
        'requests:read', 'requests:write', 'requests:export',
        'approvals:read',
        'reports:read',
      ],
    },
    {
      name: 'APPROVAL_AUTHORITY',
      displayName: 'Approval Authority',
      description: 'Reviews requests, approves or rejects quantities, enters remarks and sends requests to higher authorities where required',
      isSystem: true,
      permissions: [
        'requests:read',
        'approvals:read', 'approvals:decide', 'approvals:escalate',
        'reports:read',
      ],
    },
    {
      name: 'QUOTA_CONTROLLER',
      displayName: 'Quota Controller',
      description: 'Manages a specific ticket quota and its permitted allocations',
      isSystem: true,
      permissions: [
        'quotas:read', 'quotas:write', 'quotas:transfer',
        'inventory:read',
        'allocations:read',
        'reports:read',
      ],
    },
    {
      name: 'TICKET_ALLOCATION_OFFICER',
      displayName: 'Ticket Allocation Officer',
      description: 'Assigns approved ticket quantities to actual ticket categories, seat blocks or ticket numbers',
      isSystem: true,
      permissions: [
        'requests:read',
        'approvals:read',
        'inventory:read',
        'quotas:read',
        'allocations:read', 'allocations:write', 'allocations:confirm', 'allocations:committee',
        'reports:read',
      ],
    },
    {
      name: 'DISTRIBUTION_OFFICER',
      displayName: 'Distribution Officer',
      description: 'Issues physical tickets, manages digital ticket delivery, captures collection acknowledgements and records returns',
      isSystem: true,
      permissions: [
        'requests:read',
        'allocations:read',
        'distribution:read', 'distribution:write', 'distribution:issue', 'distribution:handover', 'distribution:return',
        'reports:read',
      ],
    },
    {
      name: 'SENIOR_MANAGEMENT',
      displayName: 'Senior Management',
      description: 'Has a consolidated overview, can review escalated requests and can authorise exceptions within defined permissions',
      isSystem: true,
      permissions: [
        'matches:read',
        'requests:read', 'requests:export',
        'approvals:read', 'approvals:decide', 'approvals:escalate',
        'inventory:read',
        'quotas:read',
        'allocations:read',
        'distribution:read',
        'reports:read', 'reports:export', 'reports:reconciliation',
        'audit:read',
      ],
    },
    {
      name: 'AUDITOR',
      displayName: 'Auditor',
      description: 'Read only access to history, approval records, ticket movement and reconciliation reports',
      isSystem: true,
      permissions: [
        'matches:read',
        'requests:read',
        'approvals:read',
        'inventory:read',
        'quotas:read',
        'allocations:read',
        'distribution:read',
        'reports:read', 'reports:export', 'reports:reconciliation',
        'audit:read', 'audit:export',
      ],
    },
  ]

  for (const role of roles) {
    const { permissions: rolePerms, ...roleData } = role
    const createdRole = await prisma.role.upsert({
      where: { name: roleData.name },
      update: roleData,
      create: roleData,
    })

    // Assign permissions
    for (const permKey of rolePerms) {
      const perm = await prisma.permission.findUnique({ where: { key: permKey } })
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: createdRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: createdRole.id, permissionId: perm.id },
        })
      }
    }
  }
  console.log('✅ Roles created')

  // ============================================
  // Create Super Admin User
  // ============================================
  const hashedPassword = await bcrypt.hash('Admin@123', 12)

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@aca.gov.in' },
    update: {},
    create: {
      email: 'admin@aca.gov.in',
      passwordHash: hashedPassword,
      fullName: 'System Administrator',
      mobileNumber: '+919876543210',
      designation: 'Super Administrator',
      department: 'IT Administration',
      employeeId: 'ACA-ADMIN-001',
      isActive: true,
      mfaEnabled: false,
    },
  })

  // Assign Super Admin role
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } })
  if (superAdminRole) {
    await prisma.roleAssignment.upsert({
      where: { id: 'super-admin-assignment' },
      update: {},
      create: {
        id: 'super-admin-assignment',
        userId: superAdmin.id,
        roleId: superAdminRole.id,
        assignedBy: superAdmin.id,
        scope: 'GLOBAL',
        isActive: true,
      },
    })
  }
  console.log('✅ Super Admin user created')

  // ============================================
  // Create Sample Organisations
  // ============================================
  const organisations = [
    { name: 'Andhra Cricket Association', shortName: 'ACA', category: 'ACA_OFFICIALS' },
    { name: 'Board of Control for Cricket in India', shortName: 'BCCI', category: 'BCCI' },
    { name: 'Government of Andhra Pradesh', shortName: 'GOAP', category: 'GOVERNMENT' },
    { name: 'Visakhapatnam District Cricket Association', shortName: 'VDCA', category: 'ACA_OFFICIALS' },
    { name: 'Vijayawada Cricket Association', shortName: 'VCA', category: 'ACA_OFFICIALS' },
    { name: 'Guntur District Cricket Association', shortName: 'GDCA', category: 'ACA_OFFICIALS' },
    { name: 'Tirupati Cricket Association', shortName: 'TCA', category: 'ACA_OFFICIALS' },
    { name: 'Kurnool District Cricket Association', shortName: 'KDCA', category: 'ACA_OFFICIALS' },
    { name: 'Reliance Industries Limited', shortName: 'RIL', category: 'SPONSOR' },
    { name: 'Tata Group', shortName: 'TATA', category: 'SPONSOR' },
    { name: 'Indian Oil Corporation', shortName: 'IOC', category: 'SPONSOR' },
    { name: 'Star Sports', shortName: 'STAR', category: 'MEDIA' },
    { name: 'ESPN Cricinfo', shortName: 'ESPN', category: 'MEDIA' },
    { name: 'The Hindu', shortName: 'HINDU', category: 'MEDIA' },
    { name: 'Deccan Chronicle', shortName: 'DC', category: 'MEDIA' },
  ]

  const createdOrgs = []
  for (const org of organisations) {
    const created = await prisma.organisation.upsert({
      where: { name: org.name },
      update: {},
      create: org,
    })
    createdOrgs.push(created)
  }
  console.log('✅ Organisations created')

  // ============================================
  // Create Sample Requesters
  // ============================================
  const requesters = [
    { fullName: 'Dr. S. Ramesh', mobileNumber: '+919876500001', email: 'ramesh@aca.gov.in', designation: 'President', organisationId: createdOrgs[0].id, requesterCategory: 'VIP', protocolLevel: 1 },
    { fullName: 'Mr. K. Venkatesh', mobileNumber: '+919876500002', email: 'venkatesh@aca.gov.in', designation: 'Secretary', organisationId: createdOrgs[0].id, requesterCategory: 'VIP', protocolLevel: 2 },
    { fullName: 'Mr. P. Suresh', mobileNumber: '+919876500003', email: 'suresh@aca.gov.in', designation: 'Joint Secretary', organisationId: createdOrgs[0].id, requesterCategory: 'OFFICIAL', protocolLevel: 3 },
    { fullName: 'Ms. L. Padmaja', mobileNumber: '+919876500004', email: 'padmaja@bcci.tv', designation: 'GM - Operations', organisationId: createdOrgs[1].id, requesterCategory: 'BCCI', protocolLevel: 2 },
    { fullName: 'Mr. R. Subrahmanyam', mobileNumber: '+919876500005', email: 'subrahmanyam@gov.ap.in', designation: 'Chief Secretary', organisationId: createdOrgs[2].id, requesterCategory: 'GOVERNMENT', protocolLevel: 1 },
    { fullName: 'Mr. V. Ravi Kumar', mobileNumber: '+919876500006', email: 'ravi@vdca.in', designation: 'President', organisationId: createdOrgs[3].id, requesterCategory: 'OFFICIAL', protocolLevel: 4 },
    { fullName: 'Mr. M. Rajesh', mobileNumber: '+919876500007', email: 'rajesh@ril.com', designation: 'VP - Sports', organisationId: createdOrgs[8].id, requesterCategory: 'SPONSOR', protocolLevel: 3 },
    { fullName: 'Ms. A. Priya', mobileNumber: '+919876500008', email: 'priya@starsports.com', designation: 'Senior Producer', organisationId: createdOrgs[11].id, requesterCategory: 'MEDIA', protocolLevel: 4 },
    { fullName: 'Mr. G. Krishna', mobileNumber: '+919876500009', email: 'krishna@member.aca.in', designation: 'Life Member', organisationId: createdOrgs[0].id, requesterCategory: 'MEMBER', protocolLevel: 5 },
    { fullName: 'Ms. S. Lakshmi', mobileNumber: '+919876500010', email: 'lakshmi@stadium.ap.gov.in', designation: 'Stadium Manager', organisationId: createdOrgs[0].id, requesterCategory: 'STAFF', protocolLevel: 5 },
  ]

  for (const req of requesters) {
    await prisma.requester.upsert({
      where: { mobileNumber_organisationId: { mobileNumber: req.mobileNumber, organisationId: req.organisationId! } },
      update: {},
      create: req,
    })
  }
  console.log('✅ Requesters created')

  // ============================================
  // Create Sample Venues
  // ============================================
  const venues = [
    { name: 'Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium', shortName: 'VDCA Stadium', city: 'Visakhapatnam', state: 'Andhra Pradesh', capacity: 38000 },
    { name: 'Indira Gandhi Municipal Stadium', shortName: 'IG Stadium', city: 'Vijayawada', state: 'Andhra Pradesh', capacity: 25000 },
    { name: 'Kurnool Cricket Stadium', shortName: 'Kurnool Stadium', city: 'Kurnool', state: 'Andhra Pradesh', capacity: 20000 },
    { name: 'Tirupati Cricket Ground', shortName: 'Tirupati Ground', city: 'Tirupati', state: 'Andhra Pradesh', capacity: 15000 },
  ]

  const createdVenues = []
  for (const venue of venues) {
    const created = await prisma.venue.upsert({
      where: { name: venue.name },
      update: {},
      create: venue,
    })
    createdVenues.push(created)
  }
  console.log('✅ Venues created')

  // ============================================
  // Create Sample Match
  // ============================================
  const matchDate = new Date()
  matchDate.setDate(matchDate.getDate() + 30) // 30 days from now

  const match = await prisma.match.upsert({
    where: { id: 'sample-match-1' },
    update: {},
    create: {
      id: 'sample-match-1',
      title: 'India vs Australia - 2nd ODI',
      tournament: 'Australia Tour of India 2026',
      format: 'ODI',
      matchDate: matchDate,
      startTime: '13:30',
      venueId: createdVenues[0].id,
      status: 'UPCOMING',
      requestOpensAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      requestClosesAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // 25 days from now
      approvalDeadline: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000),
      allocationDeadline: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
      distributionDeadline: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
      matchAdminId: superAdmin.id,
      totalInventory: 38000,
      notes: 'High profile international match. Strict protocol for VIP allocations.',
      operationalInstructions: 'All VIP tickets require protocol clearance. Media accreditation through BCCI only.',
    },
  })
  console.log('✅ Sample match created')

  // ============================================
  // Create Match Sessions (for ODI - single day)
  // ============================================
  await prisma.matchSession.upsert({
    where: { matchId_sessionName: { matchId: match.id, sessionName: 'MATCH_DAY' } },
    update: {},
    create: {
      matchId: match.id,
      sessionName: 'MATCH_DAY',
      sessionDate: matchDate,
      startTime: '13:30',
      endTime: '22:00',
      isActive: true,
    },
  })

  // ============================================
  // Create Ticket Categories
  // ============================================
  const categories = [
    { matchId: match.id, name: 'VIP', displayName: 'VIP', description: 'Premium VIP seating with lounge access', pricingTier: 1, sortOrder: 1, colorCode: '#1e3a8a' },
    { matchId: match.id, name: 'PREMIUM', displayName: 'Premium', description: 'Premium stand seating', pricingTier: 2, sortOrder: 2, colorCode: '#047857' },
    { matchId: match.id, name: 'GENERAL_EAST', displayName: 'General East Stand', description: 'General admission - East Stand', pricingTier: 3, sortOrder: 3, colorCode: '#b45309' },
    { matchId: match.id, name: 'GENERAL_WEST', displayName: 'General West Stand', description: 'General admission - West Stand', pricingTier: 3, sortOrder: 4, colorCode: '#b45309' },
    { matchId: match.id, name: 'GENERAL_NORTH', displayName: 'General North Stand', description: 'General admission - North Stand', pricingTier: 3, sortOrder: 5, colorCode: '#b45309' },
    { matchId: match.id, name: 'GENERAL_SOUTH', displayName: 'General South Stand', description: 'General admission - South Stand', pricingTier: 3, sortOrder: 6, colorCode: '#b45309' },
    { matchId: match.id, name: 'MEDIA', displayName: 'Media', description: 'Media personnel seating', pricingTier: 0, sortOrder: 7, colorCode: '#7c3aed' },
    { matchId: match.id, name: 'PLAYER_GUEST', displayName: 'Player Guest', description: 'Player family and guest seating', pricingTier: 0, sortOrder: 8, colorCode: '#db2777' },
    { matchId: match.id, name: 'STADIUM_OPS', displayName: 'Stadium Operations', description: 'Stadium operations staff', pricingTier: 0, sortOrder: 9, colorCode: '#6b7280' },
    { matchId: match.id, name: 'DISCRETIONARY', displayName: 'Management Discretionary', description: 'Management discretionary allocation', pricingTier: 0, sortOrder: 10, colorCode: '#991b1b' },
  ]

  const createdCategories = []
  for (const cat of categories) {
    const created = await prisma.ticketCategory.upsert({
      where: { matchId_name: { matchId: cat.matchId, name: cat.name } },
      update: {},
      create: cat,
    })
    createdCategories.push(created)
  }
  console.log('✅ Ticket categories created')

  // Link categories to match session
  for (const cat of createdCategories) {
    await prisma.ticketValidity.upsert({
      where: { ticketCategoryId_matchSessionId: { ticketCategoryId: cat.id, matchSessionId: (await prisma.matchSession.findFirst({ where: { matchId: match.id } }))!.id } },
      update: {},
      create: {
        ticketCategoryId: cat.id,
        matchSessionId: (await prisma.matchSession.findFirst({ where: { matchId: match.id } }))!.id,
        isValid: true,
      },
    })
  }

  // ============================================
  // Create Inventory Pools
  // ============================================
  const inventoryData = [
    { matchId: match.id, ticketCategoryId: createdCategories[0].id, standName: 'VIP Pavilion', blockName: 'A', gateName: 'Gate 1', ticketFormat: 'PHYSICAL', faceValue: 5000, totalQuantity: 500, reservedQuantity: 100, availableQuantity: 400 },
    { matchId: match.id, ticketCategoryId: createdCategories[0].id, standName: 'VIP Pavilion', blockName: 'B', gateName: 'Gate 1', ticketFormat: 'PHYSICAL', faceValue: 5000, totalQuantity: 500, reservedQuantity: 50, availableQuantity: 450 },
    { matchId: match.id, ticketCategoryId: createdCategories[1].id, standName: 'Premium Stand', blockName: 'C', gateName: 'Gate 2', ticketFormat: 'PHYSICAL', faceValue: 3000, totalQuantity: 2000, reservedQuantity: 200, availableQuantity: 1800 },
    { matchId: match.id, ticketCategoryId: createdCategories[1].id, standName: 'Premium Stand', blockName: 'D', gateName: 'Gate 2', ticketFormat: 'PHYSICAL', faceValue: 3000, totalQuantity: 2000, reservedQuantity: 200, availableQuantity: 1800 },
    { matchId: match.id, ticketCategoryId: createdCategories[2].id, standName: 'East Stand', blockName: 'E1', gateName: 'Gate 3', ticketFormat: 'PHYSICAL', faceValue: 500, totalQuantity: 5000, availableQuantity: 5000 },
    { matchId: match.id, ticketCategoryId: createdCategories[2].id, standName: 'East Stand', blockName: 'E2', gateName: 'Gate 3', ticketFormat: 'PHYSICAL', faceValue: 500, totalQuantity: 5000, availableQuantity: 5000 },
    { matchId: match.id, ticketCategoryId: createdCategories[3].id, standName: 'West Stand', blockName: 'W1', gateName: 'Gate 4', ticketFormat: 'PHYSICAL', faceValue: 500, totalQuantity: 5000, availableQuantity: 5000 },
    { matchId: match.id, ticketCategoryId: createdCategories[3].id, standName: 'West Stand', blockName: 'W2', gateName: 'Gate 4', ticketFormat: 'PHYSICAL', faceValue: 500, totalQuantity: 5000, availableQuantity: 5000 },
    { matchId: match.id, ticketCategoryId: createdCategories[4].id, standName: 'North Stand', blockName: 'N1', gateName: 'Gate 5', ticketFormat: 'PHYSICAL', faceValue: 400, totalQuantity: 4000, availableQuantity: 4000 },
    { matchId: match.id, ticketCategoryId: createdCategories[5].id, standName: 'South Stand', blockName: 'S1', gateName: 'Gate 6', ticketFormat: 'PHYSICAL', faceValue: 400, totalQuantity: 4000, availableQuantity: 4000 },
    { matchId: match.id, ticketCategoryId: createdCategories[6].id, standName: 'Media Centre', blockName: 'M1', gateName: 'Gate 7', ticketFormat: 'DIGITAL', faceValue: 0, totalQuantity: 200, availableQuantity: 200 },
    { matchId: match.id, ticketCategoryId: createdCategories[7].id, standName: 'Player Pavilion', blockName: 'P1', gateName: 'Gate 1', ticketFormat: 'PHYSICAL', faceValue: 0, totalQuantity: 300, reservedQuantity: 100, availableQuantity: 200 },
    { matchId: match.id, ticketCategoryId: createdCategories[8].id, standName: 'Operations Block', blockName: 'O1', gateName: 'Gate 8', ticketFormat: 'DIGITAL', faceValue: 0, totalQuantity: 200, availableQuantity: 200 },
    { matchId: match.id, ticketCategoryId: createdCategories[9].id, standName: 'Discretionary', blockName: 'D1', gateName: 'Gate 1', ticketFormat: 'PHYSICAL', faceValue: 0, totalQuantity: 300, reservedQuantity: 100, availableQuantity: 200 },
  ]

  for (const inv of inventoryData) {
    await prisma.inventoryPool.upsert({
      where: { id: `inv-${match.id}-${inv.ticketCategoryId}-${inv.standName}-${inv.blockName}` },
      update: {},
      create: {
        id: `inv-${match.id}-${inv.ticketCategoryId}-${inv.standName}-${inv.blockName}`,
        ...inv,
      },
    })
  }
  console.log('✅ Inventory pools created')

  // ============================================
  // Create Quota Pools
  // ============================================
  const quotaPools = [
    { matchId: match.id, name: 'ACA_OFFICIALS', displayName: 'ACA Officials', description: 'Andhra Cricket Association officials and office bearers', ownerId: superAdmin.id, totalAllocation: 5000 },
    { matchId: match.id, name: 'BCCI', displayName: 'BCCI & Visiting Officials', description: 'BCCI officials and visiting cricket board representatives', totalAllocation: 3000 },
    { matchId: match.id, name: 'GOVERNMENT', displayName: 'Government & Protocol', description: 'Government officials, protocol and VVIP', totalAllocation: 4000 },
    { matchId: match.id, name: 'SPONSORS', displayName: 'Sponsors & Commercial Partners', description: 'Official sponsors and commercial partners', totalAllocation: 3000 },
    { matchId: match.id, name: 'PLAYERS', displayName: 'Players & Team Management', description: 'Players, team management and their guests', totalAllocation: 2000 },
    { matchId: match.id, name: 'MEDIA', displayName: 'Media', description: 'Accredited media personnel', totalAllocation: 500 },
    { matchId: match.id, name: 'STADIUM_OPS', displayName: 'Stadium Operations', description: 'Stadium operations and authorised personnel', totalAllocation: 1000 },
    { matchId: match.id, name: 'SPECIAL_INVITES', displayName: 'Special Invitations', description: 'Special invitees and distinguished guests', totalAllocation: 1000 },
    { matchId: match.id, name: 'DISCRETIONARY', displayName: 'Management Discretionary', description: 'Management discretionary allocation', totalAllocation: 2000 },
  ]

  const createdQuotas = []
  for (const quota of quotaPools) {
    const created = await prisma.quotaPool.upsert({
      where: { matchId_name: { matchId: quota.matchId, name: quota.name } },
      update: {},
      create: quota,
    })
    createdQuotas.push(created)
  }
  console.log('✅ Quota pools created')

  // ============================================
  // Create Quota Allocations
  // ============================================
  const quotaAllocations = [
    { quotaPoolId: createdQuotas[0].id, ticketCategoryId: createdCategories[0].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[0].id, ticketCategoryId: createdCategories[1].id, allocatedQuantity: 2000 },
    { quotaPoolId: createdQuotas[0].id, ticketCategoryId: createdCategories[2].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[0].id, ticketCategoryId: createdCategories[3].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[1].id, ticketCategoryId: createdCategories[0].id, allocatedQuantity: 500 },
    { quotaPoolId: createdQuotas[1].id, ticketCategoryId: createdCategories[1].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[1].id, ticketCategoryId: createdCategories[7].id, allocatedQuantity: 300 },
    { quotaPoolId: createdQuotas[2].id, ticketCategoryId: createdCategories[0].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[2].id, ticketCategoryId: createdCategories[1].id, allocatedQuantity: 1500 },
    { quotaPoolId: createdQuotas[2].id, ticketCategoryId: createdCategories[2].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[3].id, ticketCategoryId: createdCategories[1].id, allocatedQuantity: 1500 },
    { quotaPoolId: createdQuotas[3].id, ticketCategoryId: createdCategories[2].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[4].id, ticketCategoryId: createdCategories[7].id, allocatedQuantity: 1000 },
    { quotaPoolId: createdQuotas[4].id, ticketCategoryId: createdCategories[0].id, allocatedQuantity: 500 },
    { quotaPoolId: createdQuotas[5].id, ticketCategoryId: createdCategories[6].id, allocatedQuantity: 200 },
    { quotaPoolId: createdQuotas[6].id, ticketCategoryId: createdCategories[8].id, allocatedQuantity: 200 },
    { quotaPoolId: createdQuotas[6].id, ticketCategoryId: createdCategories[2].id, allocatedQuantity: 500 },
    { quotaPoolId: createdQuotas[7].id, ticketCategoryId: createdCategories[0].id, allocatedQuantity: 500 },
    { quotaPoolId: createdQuotas[8].id, ticketCategoryId: createdCategories[9].id, allocatedQuantity: 2000 },
  ]

  for (const qa of quotaAllocations) {
    await prisma.quotaAllocation.upsert({
      where: { quotaPoolId_ticketCategoryId: { quotaPoolId: qa.quotaPoolId, ticketCategoryId: qa.ticketCategoryId } },
      update: {},
      create: qa,
    })
  }
  console.log('✅ Quota allocations created')

  // ============================================
  // Create Approval Workflow
  // ============================================
  const workflow = await prisma.approvalWorkflow.upsert({
    where: { id: 'default-workflow' },
    update: {},
    create: {
      id: 'default-workflow',
      matchId: match.id,
      name: 'Standard Approval Workflow',
      description: 'Default multi-level approval workflow for ticket requests',
      isDefault: true,
      isActive: true,
    },
  })

  // Get roles for approval steps
  const approvalAuthRole = await prisma.role.findUnique({ where: { name: 'APPROVAL_AUTHORITY' } })
  const seniorMgmtRole = await prisma.role.findUnique({ where: { name: 'SENIOR_MANAGEMENT' } })

  const steps = [
    { workflowId: workflow.id, stepOrder: 1, name: 'Desk Verification', description: 'Initial verification by Request Desk', approverRoleId: approvalAuthRole?.id, minQuantity: 0, maxQuantity: 50, allowPartialApproval: true, allowReturnForClarification: true, allowEscalation: true, timeoutHours: 24 },
    { workflowId: workflow.id, stepOrder: 2, name: 'Department Coordinator Review', description: 'Review by Department Coordinator', approverRoleId: (await prisma.role.findUnique({ where: { name: 'DEPARTMENT_COORDINATOR' } }))?.id, minQuantity: 0, maxQuantity: 100, allowPartialApproval: true, allowReturnForClarification: true, allowEscalation: true, timeoutHours: 24 },
    { workflowId: workflow.id, stepOrder: 3, name: 'Quota Controller Check', description: 'Quota availability verification', approverRoleId: (await prisma.role.findUnique({ where: { name: 'QUOTA_CONTROLLER' } }))?.id, minQuantity: 0, allowPartialApproval: true, allowReturnForClarification: true, allowEscalation: true, timeoutHours: 12 },
    { workflowId: workflow.id, stepOrder: 4, name: 'Senior Authority Approval', description: 'Final approval for high-value requests', approverRoleId: seniorMgmtRole?.id, minQuantity: 100, allowPartialApproval: true, allowReturnForClarification: true, allowEscalation: false, timeoutHours: 48 },
  ]

  for (const step of steps) {
    await prisma.approvalStepDefinition.upsert({
      where: { id: `step-${workflow.id}-${step.stepOrder}` },
      update: {},
      create: {
        id: `step-${workflow.id}-${step.stepOrder}`,
        ...step,
      },
    })
  }
  console.log('✅ Approval workflow created')

  // ============================================
  // Create Notification Templates
  // ============================================
  const templates = [
    {
      key: 'request_submitted',
      name: 'Request Submitted',
      channel: 'IN_APP',
      subject: 'New Ticket Request Submitted',
      body: 'A new ticket request {{requestNumber}} has been submitted by {{requesterName}} for {{matchTitle}}. Requested: {{totalTickets}} tickets.',
      variables: ['requestNumber', 'requesterName', 'matchTitle', 'totalTickets'],
    },
    {
      key: 'request_assigned',
      name: 'Request Assigned',
      channel: 'IN_APP',
      subject: 'Request Assigned to You',
      body: 'Request {{requestNumber}} has been assigned to you for processing.',
      variables: ['requestNumber'],
    },
    {
      key: 'approval_pending',
      name: 'Approval Pending',
      channel: 'IN_APP',
      subject: 'Approval Required',
      body: 'Request {{requestNumber}} requires your approval. Requested: {{totalTickets}} tickets for {{matchTitle}}.',
      variables: ['requestNumber', 'totalTickets', 'matchTitle'],
    },
    {
      key: 'request_approved',
      name: 'Request Approved',
      channel: 'IN_APP',
      subject: 'Request Approved',
      body: 'Your request {{requestNumber}} has been approved. Approved quantity: {{approvedTickets}} out of {{requestedTickets}}.',
      variables: ['requestNumber', 'approvedTickets', 'requestedTickets'],
    },
    {
      key: 'request_rejected',
      name: 'Request Rejected',
      channel: 'IN_APP',
      subject: 'Request Rejected',
      body: 'Your request {{requestNumber}} has been rejected. Reason: {{reason}}',
      variables: ['requestNumber', 'reason'],
    },
    {
      key: 'allocation_completed',
      name: 'Allocation Completed',
      channel: 'IN_APP',
      subject: 'Ticket Allocation Completed',
      body: 'Allocation {{allocationNumber}} for request {{requestNumber}} has been completed. {{allocatedTickets}} tickets allocated.',
      variables: ['allocationNumber', 'requestNumber', 'allocatedTickets'],
    },
    {
      key: 'tickets_issued',
      name: 'Tickets Issued',
      channel: 'IN_APP',
      subject: 'Tickets Issued for Collection',
      body: '{{quantity}} tickets from request {{requestNumber}} have been issued. Please collect from {{collectionPoint}}.',
      variables: ['quantity', 'requestNumber', 'collectionPoint'],
    },
    {
      key: 'distribution_deadline',
      name: 'Distribution Deadline Approaching',
      channel: 'IN_APP',
      subject: 'Distribution Deadline Approaching',
      body: 'Distribution deadline for match {{matchTitle}} is in {{daysRemaining}} days. {{pendingTickets}} tickets still pending distribution.',
      variables: ['matchTitle', 'daysRemaining', 'pendingTickets'],
    },
    {
      key: 'quota_exceeded',
      name: 'Quota Exceeded',
      channel: 'IN_APP',
      subject: 'Quota Limit Exceeded',
      body: 'Request {{requestNumber}} exceeds the quota limit for {{quotaName}}. Available: {{available}}, Requested: {{requested}}.',
      variables: ['requestNumber', 'quotaName', 'available', 'requested'],
    },
    {
      key: 'inventory_low',
      name: 'Inventory Running Low',
      channel: 'IN_APP',
      subject: 'Low Inventory Alert',
      body: 'Inventory for {{category}} - {{stand}} is running low. Only {{remaining}} tickets remaining.',
      variables: ['category', 'stand', 'remaining'],
    },
  ]

  for (const tmpl of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key: tmpl.key },
      update: {},
      create: tmpl,
    })
  }
  console.log('✅ Notification templates created')

  // ============================================
  // Create System Settings
  // ============================================
  const settings = [
    { key: 'app.name', value: 'ACA TicketOps', category: 'General', description: 'Application name', isPublic: true },
    { key: 'app.organization', value: 'Andhra Cricket Association', category: 'General', description: 'Organization name', isPublic: true },
    { key: 'app.timezone', value: 'Asia/Kolkata', category: 'General', description: 'Default timezone', isPublic: true },
    { key: 'request.max_quantity_per_category', value: '100', category: 'Requests', description: 'Maximum tickets per category per request', isPublic: false, dataType: 'NUMBER' },
    { key: 'request.max_total_quantity', value: '500', category: 'Requests', description: 'Maximum total tickets per request', isPublic: false, dataType: 'NUMBER' },
    { key: 'approval.default_timeout_hours', value: '48', category: 'Approvals', description: 'Default approval timeout in hours', isPublic: false, dataType: 'NUMBER' },
    { key: 'allocation.hold_expiry_hours', value: '24', category: 'Allocations', description: 'Temporary hold expiry in hours', isPublic: false, dataType: 'NUMBER' },
    { key: 'distribution.default_method', value: 'PERSONAL_COLLECTION', category: 'Distribution', description: 'Default distribution method', isPublic: false },
    { key: 'notifications.email_enabled', value: 'true', category: 'Notifications', description: 'Enable email notifications', isPublic: false, dataType: 'BOOLEAN' },
    { key: 'notifications.sms_enabled', value: 'true', category: 'Notifications', description: 'Enable SMS notifications', isPublic: false, dataType: 'BOOLEAN' },
    { key: 'notifications.whatsapp_enabled', value: 'false', category: 'Notifications', description: 'Enable WhatsApp notifications', isPublic: false, dataType: 'BOOLEAN' },
    { key: 'security.session_timeout_hours', value: '24', category: 'Security', description: 'Session timeout in hours', isPublic: false, dataType: 'NUMBER' },
    { key: 'security.mfa_required_for_admin', value: 'true', category: 'Security', description: 'Require MFA for admin users', isPublic: false, dataType: 'BOOLEAN' },
    { key: 'security.password_min_length', value: '8', category: 'Security', description: 'Minimum password length', isPublic: false, dataType: 'NUMBER' },
    { key: 'audit.retention_days', value: '2555', category: 'Audit', description: 'Audit log retention in days (7 years)', isPublic: false, dataType: 'NUMBER' },
  ]

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }
  console.log('✅ System settings created')

  console.log('🎉 Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })