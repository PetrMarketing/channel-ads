from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


class SuccessResponse(BaseModel):
    success: bool = True


class ErrorResponse(BaseModel):
    success: bool = False
    error: str


class MergeRequest(BaseModel):
    platform: str
    init_data: Optional[str] = None
    max_user_id: Optional[str] = None
    name: Optional[str] = None


class ChannelUpdate(BaseModel):
    title: Optional[str] = None
    yandex_metrika_id: Optional[str] = None
    vk_pixel_id: Optional[str] = None
    ym_oauth_token: Optional[str] = None


class LinkCreate(BaseModel):
    name: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None


class LinkUpdate(BaseModel):
    name: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None


class VisitCreate(BaseModel):
    short_code: str
    telegram_id: Optional[int] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    init_data: Optional[str] = None
    max_user_id: Optional[str] = None
    ym_client_id: Optional[str] = None


class SubscribeRequest(BaseModel):
    visit_id: int
    telegram_id: Optional[int] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    init_data: Optional[str] = None
    max_user_id: Optional[str] = None
