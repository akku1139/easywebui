import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from './SettingsPanel';
import { Settings } from '../types';

describe('SettingsPanel', () => {
  beforeEach(() => { vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}')); });
  const mockSettings: Settings = {
    endpoints: [
      {
        id: 'ep-1',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4',
        enabled: true,
        isDefault: true,
        createdAt: Date.now(),
      },
    ],
    activeEndpointId: 'ep-1',
    mcpServers: [],
    memoryEnabled: true,
    autoMemory: true,
    theme: 'dark',
    customSystemPrompt: '',
  };

  const defaultProps = {
    settings: mockSettings,
    onUpdate: vi.fn(),
    onClose: vi.fn(),
    theme: 'dark' as const,
  };

  it('should render settings panel with title', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should show API endpoints section', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Providers')).toBeInTheDocument();
    expect(screen.getAllByText(/OpenAI/)[0]).toBeInTheDocument();
  });

  it('should show memory settings section', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Memory Settings')).toBeInTheDocument();
    expect(screen.getByText('Enable Memory')).toBeInTheDocument();
    expect(screen.getByText('Auto-detect Facts')).toBeInTheDocument();
  });

  it('should show theme settings section', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('should show custom system prompt section', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Custom System Prompt')).toBeInTheDocument();
  });

  it('should toggle memory enabled', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const memoryCheckbox = screen.getByLabelText('Enable Memory');
    fireEvent.click(memoryCheckbox);
    
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });

  it('should toggle auto memory', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const autoMemoryCheckbox = screen.getByLabelText('Auto-detect Facts');
    fireEvent.click(autoMemoryCheckbox);
    
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });

  it('should change theme to light', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const lightButton = screen.getByText('Light');
    fireEvent.click(lightButton);
    
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });

  it('should change theme to dark', () => {
    render(<SettingsPanel {...defaultProps} theme="light" />);
    
    const darkButton = screen.getByText('Dark');
    fireEvent.click(darkButton);
    
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });

  it('should change theme to system', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const systemButton = screen.getByText('System');
    fireEvent.click(systemButton);
    
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });

  it('should update custom system prompt', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const textarea = screen.getByPlaceholderText(/You are a helpful AI assistant/);
    fireEvent.change(textarea, { target: { value: 'You are a pirate' } });
    
    expect(textarea).toHaveValue('You are a pirate');
  });

  it('should save settings', async () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const saveButton = screen.getByText('Save Settings');
    fireEvent.click(saveButton);
    
    await waitFor(() => expect(defaultProps.onUpdate).toHaveBeenCalled());
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should cancel and close', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should add new endpoint', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    const addButton = screen.getByText('+ Add Provider');
    fireEvent.click(addButton);
    
    expect(screen.getByText('Add Provider')).toBeInTheDocument();
  });

  it('should show endpoint details', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('https://api.openai.com/v1')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit model gpt-4')).toBeInTheDocument();
  });

  it('should render with light theme', () => {
    render(<SettingsPanel {...defaultProps} theme="light" />);
    
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should show active endpoint indicator', () => {
    render(<SettingsPanel {...defaultProps} />);
    
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('rotates the provider key without duplicating credentials into models', async () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Edit provider OpenAI'));
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'rotated' } });
    fireEvent.click(screen.getByText('Save Provider'));
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => expect(defaultProps.onUpdate).toHaveBeenCalled());
    const saved = defaultProps.onUpdate.mock.calls[0][0];
    expect(saved.providers[0].apiKey).toBe('rotated');
    expect(saved.models[0]).not.toHaveProperty('apiKey');
    expect(saved.models[0].providerId).toBe(saved.providers[0].id);
  });

  it('keeps the panel open and does not publish changes when server save fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Save Settings'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save settings');
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('deleting a provider also removes its models rather than resurrecting old endpoints', async () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Delete provider OpenAI'));
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => expect(defaultProps.onUpdate).toHaveBeenCalled());
    expect(defaultProps.onUpdate.mock.calls[0][0]).toMatchObject({ providers: [], models: [], endpoints: [], activeModelId: null });
  });
});
