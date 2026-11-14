import { createTheme } from '@mui/material/styles'

const ink = '#0f2744'
const line = '#e2e8f0'

const theme = createTheme({
  palette: {
    primary: { main: ink, contrastText: '#ffffff' },
    secondary: { main: '#0f766e' },
    background: { default: '#f3f5f8', paper: '#ffffff' },
    text: { primary: '#122033', secondary: '#5b6b7c' },
    divider: line,
    success: { main: '#0f766e' },
    error: { main: '#b42318' },
    warning: { main: '#b45309' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h6: { fontWeight: 650, letterSpacing: '-0.02em' },
    subtitle1: { fontWeight: 650, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 650, letterSpacing: '0.01em' },
    overline: { fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.4 },
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f3f5f8' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0, variant: 'outlined' },
      styleOverrides: { root: { borderColor: line, backgroundImage: 'none' } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '8px 12px', borderColor: '#eef2f6', verticalAlign: 'middle' },
        head: {
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.01em',
          textTransform: 'none',
          backgroundColor: '#f8fafc',
          color: '#526070',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', boxShadow: 'none', borderRadius: 8 },
        contained: { '&:hover': { boxShadow: 'none' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 650 },
        sizeSmall: { height: 22 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 650,
          borderColor: line,
          color: '#334155',
          padding: '5px 14px',
          '&.Mui-selected': {
            backgroundColor: ink,
            color: '#fff',
            '&:hover': { backgroundColor: '#163556' },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: '#f4f7fb',
            boxShadow: `inset 3px 0 0 ${ink}`,
            '&:hover': { backgroundColor: '#eef3f8' },
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
  },
})

export default theme
