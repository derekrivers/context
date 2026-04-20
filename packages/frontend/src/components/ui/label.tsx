import * as React from 'react'
import { cn } from '../../lib/cn.js'

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium text-fg', className)}
    {...props}
  />
))
Label.displayName = 'Label'
