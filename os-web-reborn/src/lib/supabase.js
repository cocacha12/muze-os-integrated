import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bubblfvliussddwvxdhy.supabase.co'
const supabaseAnonKey = 'sb_publishable_4Ec26a9o3HCSpHIuJ3nq8A_NNhtKzft'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
