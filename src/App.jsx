import { AuthProvider, useAuth, LoginPage } from './components/Auth'

function Shell() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{padding:20}}>Loading...</div>
  if (!user) return <LoginPage />
  return <div style={{padding:20}}>Logged in! {user.email}</div>
}

export default function App() {
  return <AuthProvider><Shell/></AuthProvider>
}
