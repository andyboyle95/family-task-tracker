export type TaskStatus = 'pending' | 'completed' | 'cancelled'
export type UserRole = 'admin' | 'member'

export interface Family {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export interface Profile {
  id: string
  family_id: string | null
  name: string
  avatar_color: string
  role: UserRole
  points: number
  created_at: string
}

export interface Task {
  id: string
  family_id: string
  title: string
  notes: string | null
  assigned_to: string | null
  created_by: string
  due_at: string | null
  status: TaskStatus
  point_bounty: number
  is_bounty: boolean
  recurrence_rule: string | null
  recurrence_parent_id: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
  assignee?: Profile | null
  creator?: Profile | null
}

export interface PushSubscription {
  id: string
  user_id: string
  subscription: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  created_at: string
}

export interface NLPResult {
  title: string
  due_at: string | null
  assignee_name: string | null
  recurrence_rule: string | null
  point_bounty: number | null
  is_bounty: boolean
}

export interface TaskFormData {
  title: string
  notes: string
  assigned_to: string
  due_at: string
  due_time: string
  recurrence_rule: string
  point_bounty: number
  is_bounty: boolean
}
