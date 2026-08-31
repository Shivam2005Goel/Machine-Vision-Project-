interface KeyboardHintProps {
  action: string;
  className?: string;
}

export function KeyboardHint({ action, className = '' }: KeyboardHintProps) {
  return (
    <p className={`keyboard-hint keyboard-hint--keys${className ? ` ${className}` : ''}`}>
      Press <kbd>Enter</kbd> or <kbd>Space</kbd> to {action}
    </p>
  );
}
