import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertCreateTenantInput,
  assertMembershipUpdateAllowed,
  buildMembershipAccess,
  buildProjectScopeSearchParams,
  buildTenantAccessPolicyDefinitions,
  normalizeUpdateTenantInput,
  normalizeUpdateTenantMembershipInput,
} from '@/lib/tenants/management'

test('buildProjectScopeSearchParams uses Medplum cross-project search syntax', () => {
  assert.deepEqual(buildProjectScopeSearchParams('project-1'), {
    _project: 'project-1',
  })

  assert.throws(
    () => buildProjectScopeSearchParams('   '),
    /Medplum project id is required/,
  )
})

test('assertCreateTenantInput normalizes bootstrap users and clinic profile', () => {
  const users = assertCreateTenantInput({
    slug: 'clinic-alpha',
    displayName: 'Clinic Alpha',
    organizationProfile: {
      contactEmail: 'INFO@clinic.example ',
      legalName: 'Clinic Alpha LLC',
      timezone: 'America/New_York',
    },
    primaryAdmin: {
      firstName: 'Alice',
      lastName: 'Admin',
      email: 'ALICE@clinic.example ',
      sendEmail: true,
    },
    initialUsers: [
      {
        firstName: 'Bob',
        lastName: 'Staff',
        email: 'Bob@clinic.example ',
        role: 'Staff',
      },
    ],
  })

  assert.equal(users[0].email, 'alice@clinic.example')
  assert.equal(users[0].role, 'TenantAdmin')
  assert.equal(users[0].sendEmail, true)
  assert.equal(users[1].email, 'bob@clinic.example')
})

test('normalizeUpdateTenantInput trims values and guards status', () => {
  const normalized = normalizeUpdateTenantInput({
    displayName: '  Updated Clinic  ',
    status: 'disabled',
  })

  assert.deepEqual(normalized, {
    displayName: 'Updated Clinic',
    status: 'disabled',
  })

  assert.throws(
    () =>
      normalizeUpdateTenantInput({
        status: 'archived' as never,
      }),
    /Unsupported tenant status/,
  )
})

test('buildMembershipAccess shapes role policy payload', () => {
  assert.deepEqual(
    buildMembershipAccess('TenantAdmin', {
      reference: 'AccessPolicy/policy-1',
    }),
    [
      {
        policy: {
          reference: 'AccessPolicy/policy-1',
        },
      },
    ],
  )
})

test('buildTenantAccessPolicyDefinitions lets Staff write clinical records only', () => {
  const policies = buildTenantAccessPolicyDefinitions()
  const staffResources = policies.Staff.resource ?? []

  for (const policy of Object.values(policies)) {
    assert.equal(
      'description' in policy,
      false,
      `${policy.name} must contain only fields supported by Medplum AccessPolicy`,
    )
  }

  for (const resourceType of ['Patient', 'Observation', 'Task', 'DocumentReference']) {
    const resource = staffResources.find((entry) => entry.resourceType === resourceType)
    assert.ok(resource, `Expected Staff policy to include ${resourceType}`)
    assert.deepEqual(resource?.interaction, [
      'create',
      'read',
      'update',
      'search',
      'history',
      'vread',
    ])
  }

  for (const resourceType of [
    'Binary',
    'CarePlan',
    'Composition',
    'Condition',
    'Coverage',
    'DiagnosticReport',
    'Encounter',
    'Immunization',
    'MedicationStatement',
    'Procedure',
    'QuestionnaireResponse',
    'ServiceRequest',
  ]) {
    const resource = staffResources.find((entry) => entry.resourceType === resourceType)
    assert.ok(resource, `Expected Staff policy to include read access to ${resourceType}`)
    assert.equal(resource?.readonly, true)
  }

  assert.equal(
    staffResources.some((entry) => entry.resourceType === '*'),
    false,
  )
  assert.equal(
    staffResources.some((entry) => entry.resourceType === 'ProjectMembership'),
    false,
  )
  assert.equal(
    staffResources.some((entry) => entry.resourceType === 'AccessPolicy'),
    false,
  )
})

test('normalizeUpdateTenantMembershipInput keeps only supported fields', () => {
  assert.deepEqual(
    normalizeUpdateTenantMembershipInput({
      role: 'Staff',
      active: false,
    }),
    {
      role: 'Staff',
      active: false,
    },
  )

  assert.throws(
    () => normalizeUpdateTenantMembershipInput({}),
    /At least one membership field/,
  )
})

test('assertMembershipUpdateAllowed blocks removing the last active admin', () => {
  assert.throws(
    () =>
      assertMembershipUpdateAllowed(
        [
          {
            id: 'membership-1',
            active: true,
            admin: true,
          },
        ],
        'membership-1',
        {
          active: false,
        },
      ),
    /retain at least one active tenant admin/,
  )

  assert.doesNotThrow(() =>
    assertMembershipUpdateAllowed(
      [
        {
          id: 'membership-1',
          active: true,
          admin: true,
        },
        {
          id: 'membership-2',
          active: true,
          admin: true,
        },
      ],
      'membership-1',
      {
        role: 'Staff',
      },
    ),
  )
})
