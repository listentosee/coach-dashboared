import { describe, it, expect, beforeEach } from 'vitest'
import { GamePlatformClient } from './client'
import { clearMockData, seedMockData } from '../../../tests/mocks/metactf-handlers'

describe('GamePlatformClient', () => {
  let client: GamePlatformClient

  beforeEach(() => {
    clearMockData()
    client = new GamePlatformClient()
  })

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'competitor' as const,
        syned_user_id: 'test-user-123',
        division: 'high_school' as const,
        affiliation: 'Test School',
      }

      const result = await client.createUser(userData)

      expect(result).toMatchObject({
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        role: userData.role,
        syned_user_id: userData.syned_user_id,
      })
      expect(result.metactf_user_id).toBeDefined()
      expect(result.metactf_user_status).toBe('active')
    })

    it('should handle missing required fields', async () => {
      const invalidData = {
        email: 'test@example.com',
        // Missing required fields
      } as any

      await expect(client.createUser(invalidData)).rejects.toThrow()
    })

    it('should include optional syned_user_id for idempotency', async () => {
      const userData = {
        email: 'test@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        role: 'competitor' as const,
        syned_user_id: 'idempotent-key-456',
        division: 'college' as const,
        affiliation: 'University',
      }

      const result = await client.createUser(userData)

      expect(result.syned_user_id).toBe('idempotent-key-456')
    })
  })

  describe('getUser', () => {
    it('should retrieve an existing user', async () => {
      // Seed test data
      const testUser = {
        syned_user_id: 'existing-user-789',
        metactf_user_id: 'metactf-789',
        email: 'existing@example.com',
        first_name: 'Existing',
        last_name: 'User',
        role: 'competitor',
        metactf_user_status: 'active',
        metactf_username: 'existing',
      }

      seedMockData({ users: [testUser] })

      const result = await client.getUser('existing-user-789')

      expect(result).toMatchObject({
        syned_user_id: 'existing-user-789',
        email: 'existing@example.com',
        first_name: 'Existing',
        last_name: 'User',
      })
    })

    it('should return null for non-existent user', async () => {
      const result = await client.getUser('non-existent-user')

      expect(result).toBeNull()
    })
  })

  describe('createTeam', () => {
    it('should create a team successfully', async () => {
      const teamData = {
        syned_team_id: 'test-team-123',
        syned_coach_user_id: 'coach-456',
        name: 'Test Cyber Team',
        division: 'high_school' as const,
        affiliation: 'Test High School',
      }

      const result = await client.createTeam(teamData)

      expect(result).toMatchObject({
        syned_team_id: teamData.syned_team_id,
        syned_coach_user_id: teamData.syned_coach_user_id,
        name: teamData.name,
        division: teamData.division,
        affiliation: teamData.affiliation,
      })
      expect(result.metactf_team_id).toBeDefined()
      expect(result.metactf_coach_id).toBeDefined()
    })

    it('should handle all division types', async () => {
      const divisions = ['middle_school', 'high_school', 'college'] as const

      for (const division of divisions) {
        const teamData = {
          syned_team_id: `team-${division}`,
          syned_coach_user_id: 'coach-123',
          name: `${division} Team`,
          division,
          affiliation: 'School',
        }

        const result = await client.createTeam(teamData)

        expect(result.division).toBe(division)
      }
    })
  })

  describe('deleteTeam', () => {
    it('should delete a team with no members', async () => {
      // Seed team
      const testTeam = {
        syned_team_id: 'deletable-team',
        metactf_team_id: 'metactf-team-123',
        name: 'Deletable Team',
        division: 'high_school',
        affiliation: 'School',
      }

      seedMockData({ teams: [testTeam] })

      await expect(client.deleteTeam('deletable-team')).resolves.not.toThrow()
    })

    it('should fail to delete team with members', async () => {
      // Seed team with members
      const testTeam = {
        syned_team_id: 'team-with-members',
        metactf_team_id: 'metactf-team-456',
        name: 'Team With Members',
        division: 'high_school',
        affiliation: 'School',
      }

      const assignments = {
        'team-with-members': [
          { syned_user_id: 'user-1', syned_team_id: 'team-with-members' },
        ],
      }

      seedMockData({ teams: [testTeam], assignments })

      await expect(client.deleteTeam('team-with-members')).rejects.toThrow(/members/)
    })

    it('should handle non-existent team gracefully', async () => {
      await expect(client.deleteTeam('non-existent-team')).rejects.toThrow(/not found/)
    })
  })

  describe('assignMember', () => {
    it('should assign a user to a team', async () => {
      const assignmentData = {
        syned_user_id: 'user-123',
        syned_team_id: 'team-456',
      }

      const result = await client.assignMember(assignmentData)

      expect(result).toMatchObject({
        syned_user_id: 'user-123',
        syned_team_id: 'team-456',
      })
      expect(result.assigned_at).toBeDefined()
    })

    it('should handle reassignment (idempotent)', async () => {
      const assignmentData = {
        syned_user_id: 'user-789',
        syned_team_id: 'team-101',
      }

      // Assign once
      const first = await client.assignMember(assignmentData)

      // Assign again
      const second = await client.assignMember(assignmentData)

      expect(second.syned_user_id).toBe(first.syned_user_id)
      expect(second.syned_team_id).toBe(first.syned_team_id)
    })
  })

  describe('getTeamAssignments', () => {
    it('should retrieve assignments for a specific team', async () => {
      const assignments = {
        'team-abc': [
          { syned_user_id: 'user-1', syned_team_id: 'team-abc' },
          { syned_user_id: 'user-2', syned_team_id: 'team-abc' },
        ],
      }

      seedMockData({ assignments })

      const result = await client.getTeamAssignments('team-abc')

      expect(result.assignments).toHaveLength(2)
      expect(result.total_count).toBe(2)
      expect(result.assignments[0].syned_team_id).toBe('team-abc')
    })

    it('should retrieve all assignments when no team specified', async () => {
      const assignments = {
        'team-1': [{ syned_user_id: 'user-1', syned_team_id: 'team-1' }],
        'team-2': [{ syned_user_id: 'user-2', syned_team_id: 'team-2' }],
      }

      seedMockData({ assignments })

      const result = await client.getTeamAssignments()

      expect(result.total_count).toBe(2)
    })

    it('should return empty array for team with no members', async () => {
      const result = await client.getTeamAssignments('empty-team')

      expect(result.assignments).toHaveLength(0)
      expect(result.total_count).toBe(0)
    })
  })

  describe('getScores', () => {
    it('should retrieve ODL scores for a user', async () => {
      const testScores = {
        'user-123': {
          syned_user_id: 'user-123',
          metactf_user_id: 'metactf-123',
          challenges_completed: 15,
          total_score: 450,
          monthly_ctf_challenges: 3,
          challenge_solves: [
            {
              challenge_solve_id: 'solve-1',
              challenge_id: 'ch-1',
              challenge_title: 'Basic Crypto',
              challenge_category: 'Cryptography',
              challenge_points: 30,
              solved_at: '2025-09-15T10:00:00Z',
            },
          ],
        },
      }

      seedMockData({ scores: testScores })

      const result = await client.getScores({ syned_user_id: 'user-123' })

      expect(result.challenges_completed).toBe(15)
      expect(result.total_score).toBe(450)
      expect(result.challenge_solves).toHaveLength(1)
    })

    it('should support incremental fetch with after_time_unix', async () => {
      const now = Date.now()
      const pastTime = new Date(now - 86400000).toISOString() // 1 day ago
      const recentTime = new Date(now - 3600000).toISOString() // 1 hour ago

      const testScores = {
        'user-456': {
          syned_user_id: 'user-456',
          metactf_user_id: 'metactf-456',
          challenges_completed: 2,
          total_score: 60,
          monthly_ctf_challenges: 0,
          challenge_solves: [
            {
              challenge_solve_id: 'old-solve',
              challenge_id: 'ch-old',
              challenge_title: 'Old Challenge',
              challenge_category: 'Web',
              challenge_points: 10,
              solved_at: pastTime,
            },
            {
              challenge_solve_id: 'new-solve',
              challenge_id: 'ch-new',
              challenge_title: 'Recent Challenge',
              challenge_category: 'Forensics',
              challenge_points: 50,
              solved_at: recentTime,
            },
          ],
        },
      }

      seedMockData({ scores: testScores })

      const afterTimeUnix = Math.floor((now - 7200000) / 1000) // 2 hours ago

      const result = await client.getScores({
        syned_user_id: 'user-456',
        after_time_unix: afterTimeUnix,
      })

      // Should only return recent solve
      expect(result.challenge_solves).toHaveLength(1)
      expect(result.challenge_solves[0].challenge_solve_id).toBe('new-solve')
    })

    it('should return empty data for user with no scores', async () => {
      const result = await client.getScores({ syned_user_id: 'no-scores-user' })

      expect(result.challenges_completed).toBe(0)
      expect(result.total_score).toBe(0)
      expect(result.challenge_solves).toHaveLength(0)
    })
  })

  describe('getFlashCtfProgress', () => {
    it('should retrieve Flash CTF progress for a user', async () => {
      const result = await client.getFlashCtfProgress({ syned_user_id: 'user-123' })

      expect(result).toMatchObject({
        syned_user_id: 'user-123',
        flash_ctfs: expect.any(Array),
      })
      expect(result.fetched_at).toBeDefined()
    })

    it('should handle users with no Flash CTF participation', async () => {
      const result = await client.getFlashCtfProgress({ syned_user_id: 'inactive-user' })

      expect(result.flash_ctfs).toHaveLength(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Create client with invalid base URL
      const invalidClient = new GamePlatformClient()
      // Override base URL to force failure
      ;(invalidClient as any).baseUrl = 'http://invalid-domain-that-does-not-exist.com'

      await expect(
        invalidClient.createUser({
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'competitor',
          syned_user_id: 'test-123',
          division: 'high_school',
          affiliation: 'School',
        })
      ).rejects.toThrow()
    })

    it('should handle API validation errors', async () => {
      // MSW will validate request body schema
      await expect(
        client.createUser({
          email: 'invalid-email',
          first_name: '',
          last_name: '',
          role: 'invalid-role' as any,
          syned_user_id: '',
          division: 'invalid-division' as any,
          affiliation: '',
        })
      ).rejects.toThrow()
    })
  })

  describe('Authentication', () => {
    it('should include authorization header in requests', async () => {
      // This test verifies the client sends auth headers
      // MSW handlers will validate authorization

      const userData = {
        email: 'auth-test@example.com',
        first_name: 'Auth',
        last_name: 'Test',
        role: 'competitor' as const,
        syned_user_id: 'auth-test-123',
        division: 'high_school' as const,
        affiliation: 'School',
      }

      // Should succeed with valid auth (mock server accepts any token in test env)
      await expect(client.createUser(userData)).resolves.toBeDefined()
    })
  })
})
