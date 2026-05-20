interface ChatComposerProps {
  value: string;
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function ChatComposer({ value, disabled, placeholder, onChange, onSend }: ChatComposerProps) {
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <button className="primary-action" type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
    </form>
  );
}
