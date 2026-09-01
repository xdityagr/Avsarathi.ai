import pytest
from unittest.mock import AsyncMock, patch
from src.graph import build_graph, ConversationState
from src.config import get_settings
from src.worker import MessageWorker
import asyncio


@pytest.fixture
def settings():
    return get_settings()


@pytest.fixture
def graph():
    return build_graph().compile()


def test_button_payload_parsing_project_type(graph, settings):
    # Test valid button payload for project type
    result = graph.invoke(
        {
            "message": "some ignored text", 
            "button_payload": "project_type:business",
            "consent_given": True,
            "intake_step": "awaiting_project_type"
        },
        config={"configurable": {"thread_id": "123"}}
    )
    assert result["project_type"] == "business"
    assert result["intake_step"] == "awaiting_cost"
    assert result["button_payload"] == ""


def test_button_payload_parsing_gender(graph, settings):
    # Test valid button payload for gender
    result = graph.invoke(
        {
            "message": "ignored",
            "button_payload": "gender:female",
            "project_type": "education",
            "project_cost": 200000,
            "annual_income": 100000,
            "intake_step": "awaiting_gender",
            "consent_given": True
        },
        config={"configurable": {"thread_id": "124"}}
    )
    assert result["gender"] == "female"
    assert result["intake_step"] == "done"
    assert result["button_payload"] == ""


def test_fallback_to_text_parsing_project_type(graph, settings):
    # Test fallback to text parsing when button payload is missing/invalid
    result = graph.invoke(
        {
            "message": "I want to start a business", 
            "button_payload": "", 
            "intake_step": "awaiting_project_type",
            "consent_given": True
        },
        config={"configurable": {"thread_id": "125"}}
    )
    assert result["project_type"] == "business"
    assert result["intake_step"] == "awaiting_cost"
    
    # Test invalid payload fallback
    result = graph.invoke(
        {
            "message": "I want to start a business", 
            "button_payload": "invalid:payload", 
            "intake_step": "awaiting_project_type",
            "consent_given": True
        },
        config={"configurable": {"thread_id": "126"}}
    )
    assert result["project_type"] == "business"
    assert result["intake_step"] == "awaiting_cost"


@pytest.mark.asyncio
async def test_worker_response_routing():
    # Test that worker correctly calls send_whatsapp_buttons vs send_whatsapp_message
    queue = asyncio.Queue()
    worker = MessageWorker(queue)
    
    # Mock checkpointer and graph
    worker._checkpointer = AsyncMock()
    worker._compiled_graph = AsyncMock()
    worker._rate_limiter.allow = lambda user_id: True
    
    # Scenario 1: Button message configured and should be sent
    with patch("src.worker.send_whatsapp_buttons", new_callable=AsyncMock) as mock_buttons, \
         patch("src.worker.send_whatsapp_message", new_callable=AsyncMock) as mock_message, \
         patch("src.worker.get_settings") as mock_settings:
             
        mock_settings.return_value.use_button_messages = True
        worker._compiled_graph.ainvoke.return_value = {
            "response": "Fallback text",
            "response_content_sid": "HX123",
        }
        
        await worker._process_message({"from_number": "user1", "body": "hi", "message_sid": "msg1", "button_payload": ""}, 1)
        
        mock_buttons.assert_called_once_with(
            to="user1",
            content_sid="HX123",
            fallback_body="Fallback text"
        )
        mock_message.assert_not_called()

    # Scenario 2: Button message NOT configured, fallback to text
    with patch("src.worker.send_whatsapp_buttons", new_callable=AsyncMock) as mock_buttons, \
         patch("src.worker.send_whatsapp_message", new_callable=AsyncMock) as mock_message, \
         patch("src.worker.get_settings") as mock_settings:
             
        mock_settings.return_value.use_button_messages = False
        worker._compiled_graph.ainvoke.return_value = {
            "response": "Fallback text",
            "response_content_sid": "HX123", # Graph sets it, but settings disabled it
        }
        
        await worker._process_message({"from_number": "user1", "body": "hi", "message_sid": "msg1", "button_payload": ""}, 1)
        
        mock_buttons.assert_not_called()
        mock_message.assert_called_once_with(to="user1", body="Fallback text")

    # Scenario 3: Regular text message (no content_sid)
    with patch("src.worker.send_whatsapp_buttons", new_callable=AsyncMock) as mock_buttons, \
         patch("src.worker.send_whatsapp_message", new_callable=AsyncMock) as mock_message, \
         patch("src.worker.get_settings") as mock_settings:
             
        mock_settings.return_value.use_button_messages = True
        worker._compiled_graph.ainvoke.return_value = {
            "response": "Regular text",
            "response_content_sid": "", 
        }
        
        await worker._process_message({"from_number": "user1", "body": "hi", "message_sid": "msg1", "button_payload": ""}, 1)
        
        mock_buttons.assert_not_called()
        mock_message.assert_called_once_with(to="user1", body="Regular text")
