// The button beside the message box (desktop app): a quiet label that opens or closes
// the Agent Crew panel when clicked. It runs on the drawing side, with no `$`: a click
// is posted to the hooks module, which toggles the panel.

import type { ClientModule } from 'claude-code'

export type ToggleProps = { label: string; isRunning: boolean; color: string }

const Toggle: ClientModule<ToggleProps, { isHovered: boolean }> = (props, surface) => {
  const { Text } = surface.elements
  const isHovered = surface.state?.isHovered ?? false
  surface.onPointer(e => {
    if (e.type === 'enter' || e.type === 'leave') surface.setState({ isHovered: e.type === 'enter' })
    else if (e.type === 'up' && e.button === 'left') surface.post({ toggle: true })
  })
  return (
    <Text
      color={props.isRunning ? props.color : undefined}
      dimColor={!props.isRunning && !isHovered}
      underline={isHovered}
    >
      {props.label}
    </Text>
  )
}

export default Toggle
